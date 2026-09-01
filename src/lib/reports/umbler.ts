import "server-only";

import { getYesterdayRangeBRT } from "@/lib/period";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUmblerIntegration, umblerGet } from "@/lib/umbler/client";

/**
 * Sync diário (cron nativo, 1x/dia — como o GA4) da contagem de templates de
 * WhatsApp enviados no dia anterior BRT, por template.
 *
 * A API da Umbler não tem "listar todas as mensagens da organização" — só
 * por chat. Estratégia validada contra a conta real: busca os chats cuja
 * ÚLTIMA mensagem é >= início do dia alvo (RelativeStartFromEventUTC +
 * ChatOrderBy=LastMessage + TakeAfter — um chat com last-message ANTES disso
 * não pode ter mensagem no dia, então é seguro excluir), depois varre as
 * mensagens de cada um filtrando por `templateId` preenchido dentro da janela
 * exata do dia.
 *
 * Uma conta com muitos chats pode ter centenas de chamadas (uma por chat) —
 * sequencial isso estoura os 60s da função (visto na 1ª execução real).
 * Corrigido com concorrência limitada + orçamento de tempo: o sync sempre
 * retorna dentro do prazo, marcando `partial: true` se não deu tempo de
 * varrer tudo (fica pro próximo dia, não é dado financeiro).
 *
 * Cliques em botão: cada mensagem de template já vem com `buttons[]`, e cada
 * botão tem `selected: boolean` (validado contra mensagens reais com clique
 * de verdade) — não precisa de chamada extra na API, só ler o campo que já
 * está na mesma resposta usada pra contar os envios.
 */

const MAX_CHAT_PAGES = 20;
const MAX_MESSAGE_PAGES = 5;
const PAGE_SIZE = 250;
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 45_000;

export type UmblerSyncSummary = {
  areaId: string;
  day: string;
  chatsScanned: number;
  templatesFound: number;
  partial: boolean;
  errors: string[];
};

/** Roda `worker` para cada item, no máximo `concurrency` em paralelo. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

async function syncArea(areaId: string, deadline: number): Promise<UmblerSyncSummary> {
  const { from, to, dayYmd } = getYesterdayRangeBRT();
  const errors: string[] = [];
  let partial = false;

  const integration = await getUmblerIntegration(areaId);
  if (!integration) {
    return { areaId, day: dayYmd, chatsScanned: 0, templatesFound: 0, partial: false, errors };
  }

  // Rótulo dos templates (pra não gravar só o id ilegível).
  const templateLabels = new Map<string, string>();
  const templatesResult = await umblerGet<{ items?: { id?: string; label?: string }[] }>(
    integration,
    "/v1/templates/",
    { Take: "250" },
  );
  if (templatesResult.error) errors.push(`templates: ${templatesResult.error}`);
  for (const t of templatesResult.data?.items ?? []) {
    if (t.id && t.label) templateLabels.set(t.id, t.label);
  }

  // Chats que podem ter mensagem no dia alvo (última mensagem >= início do dia).
  const chatIds: string[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_CHAT_PAGES; page += 1) {
    if (Date.now() > deadline) {
      partial = true;
      errors.push("tempo esgotado ao listar chats — parcial");
      break;
    }
    const result = await umblerGet<{ items?: { id?: string }[] }>(integration, "/v1/chats/", {
      RelativeStartFromEventUTC: from.toISOString(),
      RelativeTakeDirection: "TakeAfter",
      ChatOrderBy: "LastMessage",
      Order: "Asc",
      Skip: String(skip),
      Take: String(PAGE_SIZE),
    });
    if (result.error) {
      errors.push(`chats: ${result.error}`);
      break;
    }
    const items = result.data?.items ?? [];
    for (const c of items) if (c.id) chatIds.push(c.id);
    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  // Varre as mensagens de cada chat (em paralelo, limitado), contando os
  // envios de template no dia. Para de pegar chats NOVOS depois do prazo,
  // mas não aborta o que já está em andamento.
  const sendsByTemplate = new Map<string, number>();
  const clicksByTemplate = new Map<string, number>();
  let chatsScanned = 0;

  const pending = [...chatIds];
  await runPool(pending, CONCURRENCY, async (chatId) => {
    if (Date.now() > deadline) {
      partial = true;
      return;
    }
    chatsScanned += 1;

    let cursor = from;
    for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
      const result = await umblerGet<{
        messages?: {
          templateId?: string | null;
          eventAtUTC?: string;
          buttons?: { selected?: boolean }[] | null;
        }[];
      }>(integration, `/v1/chats/${chatId}/relative-messages/`, {
        FromEventUTC: cursor.toISOString(),
        Direction: "TakeAfter",
        Take: String(PAGE_SIZE),
      });

      if (result.error) {
        errors.push(`chat ${chatId}: ${result.error}`);
        break;
      }

      const messages = result.data?.messages ?? [];
      let lastEventAt: string | null = null;

      for (const m of messages) {
        if (!m.eventAtUTC) continue;
        lastEventAt = m.eventAtUTC;

        const eventTime = new Date(m.eventAtUTC).getTime();
        if (eventTime < from.getTime() || eventTime > to.getTime()) continue;

        if (m.templateId) {
          sendsByTemplate.set(m.templateId, (sendsByTemplate.get(m.templateId) ?? 0) + 1);

          // Conta como clique se PELO MENOS UM botão da mensagem foi selecionado.
          if (m.buttons?.some((b) => b.selected)) {
            clicksByTemplate.set(m.templateId, (clicksByTemplate.get(m.templateId) ?? 0) + 1);
          }
        }
      }

      if (messages.length < PAGE_SIZE || !lastEventAt || Date.now() > deadline) break;
      cursor = new Date(lastEventAt);
    }
  });

  const admin = createAdminClient();
  for (const [templateId, count] of sendsByTemplate) {
    const { error } = await admin.from("umbler_template_sends").upsert(
      {
        area_id: areaId,
        day: dayYmd,
        template_id: templateId,
        template_label: templateLabels.get(templateId) ?? null,
        sends: count,
        clicks: clicksByTemplate.get(templateId) ?? 0,
      },
      { onConflict: "area_id,day,template_id" },
    );
    if (error) errors.push(`persist ${templateId}: ${error.message}`);
  }

  return { areaId, day: dayYmd, chatsScanned, templatesFound: sendsByTemplate.size, partial, errors };
}

export async function runUmblerSyncForAllAreas(): Promise<UmblerSyncSummary[]> {
  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return [];

  // Orçamento único pra TODAS as áreas juntas (a função tem um limite total
  // de execução, não por área) — cada área recebe uma fatia do que sobrar.
  const deadline = Date.now() + TIME_BUDGET_MS;

  const summaries: UmblerSyncSummary[] = [];
  for (const area of areas) {
    const areaId = area.id as string;
    try {
      summaries.push(await syncArea(areaId, deadline));
    } catch (err) {
      summaries.push({
        areaId,
        day: "",
        chatsScanned: 0,
        templatesFound: 0,
        partial: true,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
