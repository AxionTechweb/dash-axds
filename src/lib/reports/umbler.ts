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
 */

const MAX_CHAT_PAGES = 20;
const MAX_MESSAGE_PAGES = 5;
const PAGE_SIZE = 250;

export type UmblerSyncSummary = {
  areaId: string;
  day: string;
  chatsScanned: number;
  templatesFound: number;
  errors: string[];
};

async function syncArea(areaId: string): Promise<UmblerSyncSummary> {
  const { from, to, dayYmd } = getYesterdayRangeBRT();
  const errors: string[] = [];

  const integration = await getUmblerIntegration(areaId);
  if (!integration) {
    return { areaId, day: dayYmd, chatsScanned: 0, templatesFound: 0, errors };
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

  // Varre as mensagens de cada chat, contando os envios de template no dia.
  const sendsByTemplate = new Map<string, number>();
  for (const chatId of chatIds) {
    let cursor = from;

    for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
      const result = await umblerGet<{
        messages?: { templateId?: string | null; eventAtUTC?: string }[];
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
        }
      }

      if (messages.length < PAGE_SIZE || !lastEventAt) break;
      cursor = new Date(lastEventAt);
    }
  }

  const admin = createAdminClient();
  for (const [templateId, count] of sendsByTemplate) {
    const { error } = await admin.from("umbler_template_sends").upsert(
      {
        area_id: areaId,
        day: dayYmd,
        template_id: templateId,
        template_label: templateLabels.get(templateId) ?? null,
        sends: count,
      },
      { onConflict: "area_id,day,template_id" },
    );
    if (error) errors.push(`persist ${templateId}: ${error.message}`);
  }

  return { areaId, day: dayYmd, chatsScanned: chatIds.length, templatesFound: sendsByTemplate.size, errors };
}

export async function runUmblerSyncForAllAreas(): Promise<UmblerSyncSummary[]> {
  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return [];

  const summaries: UmblerSyncSummary[] = [];
  for (const area of areas) {
    const areaId = area.id as string;
    try {
      summaries.push(await syncArea(areaId));
    } catch (err) {
      summaries.push({
        areaId,
        day: "",
        chatsScanned: 0,
        templatesFound: 0,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
