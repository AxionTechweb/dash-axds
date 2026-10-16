import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getUmblerIntegration, umblerGet, type UmblerIntegration } from "./client";

/**
 * Métricas AO VIVO da Umbler Talk pra página /umbler — chats, contatos,
 * setores, atendentes e conversão pra venda. Uma chamada paginada por
 * carregamento, mesmo espírito da página /vturb (nada fica salvo no banco
 * aqui — quem precisa de snapshot é só a contagem de templates, em
 * src/lib/reports/umbler.ts).
 *
 * Campos aninhados da API validados contra uma conta real antes de
 * implementar; ainda assim lidos defensivamente (tudo opcional) — uma
 * mudança de formato não pode derrubar a página, só empobrecer os números.
 */

const MAX_PAGES = 20;
const PAGE_SIZE = 250;

type ChatRef = { id?: string; name?: string } | null | undefined;

type ChatItem = {
  id?: string;
  contact?: { id?: string; name?: string; phoneNumber?: string } | null;
  sector?: ChatRef;
  organizationMember?: ChatRef;
  tags?: ChatRef[] | null;
  open?: boolean;
  waiting?: boolean;
  closedAtUTC?: string | null;
  firstContactMessage?: { eventAtUTC?: string } | null;
  firstMemberReplyMessage?: { eventAtUTC?: string } | null;
};

type ChatsPage = { items?: ChatItem[] };

async function paginateChats(
  integration: UmblerIntegration,
  from: Date,
  to: Date,
): Promise<{ chats: ChatItem[]; errors: string[] }> {
  const chats: ChatItem[] = [];
  const errors: string[] = [];
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await umblerGet<ChatsPage>(integration, "/v1/chats/", {
      DateStartCreatedAtUTC: from.toISOString(),
      DateEndCreatedAtUTC: to.toISOString(),
      Skip: String(skip),
      Take: String(PAGE_SIZE),
    });

    if (result.error) {
      errors.push(result.error);
      break;
    }

    const items = result.data?.items ?? [];
    chats.push(...items);
    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return { chats, errors };
}

/** 8-11 dígitos finais — mesma normalização já usada pro match visitante/compra. */
function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

function bump(map: Map<string, { id: string; name: string; count: number }>, ref: ChatRef) {
  if (!ref?.id) return;
  const name = ref.name ?? ref.id;
  const entry = map.get(ref.id) ?? { id: ref.id, name, count: 0 };
  entry.count += 1;
  map.set(ref.id, entry);
}

export type ChatVolumeSummary = {
  totalChats: number;
  openChats: number;
  closedChats: number;
  waitingChats: number;
  uniqueContacts: number;
  bySector: { id: string; name: string; count: number }[];
  byTag: { id: string; name: string; count: number }[];
  byMember: { id: string; name: string; count: number }[];
  /** null quando a API não trouxe dado suficiente pra calcular (formato inesperado ou nenhum chat com resposta). */
  avgFirstReplySeconds: number | null;
};

export async function getChatVolumeSummary(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ summary: ChatVolumeSummary | null; errors: string[] }> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) return { summary: null, errors: [] };

  const { chats, errors } = await paginateChats(integration, from, to);

  // organizationMember do chat não traz nome, só id — enriquece com quem está
  // online agora (melhor esforço: agente offline no momento da consulta, ou
  // um agente de IA, aparece só com o id mesmo).
  const memberNames = new Map<string, string>();
  const onlineResult = await umblerGet<{ id?: string; displayName?: string }[]>(
    integration,
    "/v1/members/online/",
  );
  for (const m of onlineResult.data ?? []) {
    if (m.id && m.displayName) memberNames.set(m.id, m.displayName);
  }

  const bySector = new Map<string, { id: string; name: string; count: number }>();
  const byTag = new Map<string, { id: string; name: string; count: number }>();
  const byMember = new Map<string, { id: string; name: string; count: number }>();
  const uniqueContacts = new Set<string>();

  let openChats = 0;
  let closedChats = 0;
  let waitingChats = 0;
  let replySecondsSum = 0;
  let replySamples = 0;

  for (const chat of chats) {
    if (chat.contact?.id) uniqueContacts.add(chat.contact.id);
    if (chat.open) openChats += 1;
    if (chat.closedAtUTC) closedChats += 1;
    if (chat.waiting) waitingChats += 1;

    bump(bySector, chat.sector);
    bump(
      byMember,
      chat.organizationMember?.id
        ? { id: chat.organizationMember.id, name: memberNames.get(chat.organizationMember.id) }
        : null,
    );
    for (const tag of chat.tags ?? []) bump(byTag, tag);

    const startedAt = chat.firstContactMessage?.eventAtUTC;
    const repliedAt = chat.firstMemberReplyMessage?.eventAtUTC;
    if (startedAt && repliedAt) {
      const diff = new Date(repliedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(diff) && diff >= 0) {
        replySecondsSum += diff / 1000;
        replySamples += 1;
      }
    }
  }

  const sortDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;

  return {
    summary: {
      totalChats: chats.length,
      openChats,
      closedChats,
      waitingChats,
      uniqueContacts: uniqueContacts.size,
      bySector: [...bySector.values()].sort(sortDesc),
      byTag: [...byTag.values()].sort(sortDesc),
      byMember: [...byMember.values()].sort(sortDesc),
      avgFirstReplySeconds: replySamples > 0 ? replySecondsSum / replySamples : null,
    },
    errors,
  };
}

export type RatingsSummary = { total: number; byRating: Record<string, number> };

export async function getRatingsSummary(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ summary: RatingsSummary | null; errors: string[] }> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) return { summary: null, errors: [] };

  const result = await umblerGet<{ rating?: string; dateUTC?: string }[]>(
    integration,
    "/v1/contact-ratings/simplified/",
    { startUTC: from.toISOString(), endUTC: to.toISOString() },
  );

  if (result.error) return { summary: null, errors: [result.error] };

  const byRating: Record<string, number> = {};
  for (const row of result.data ?? []) {
    const rating = row.rating ?? "NoRating";
    byRating[rating] = (byRating[rating] ?? 0) + 1;
  }

  return {
    summary: { total: result.data?.length ?? 0, byRating },
    errors: [],
  };
}

export type ChatConversionSummary = {
  chatsWithContact: number;
  matchedSales: number;
  matchedRevenue: number;
};

/**
 * Casa o telefone dos contatos que conversaram no período com compras
 * aprovadas (todo o histórico, não só o período — a venda pode ter
 * acontecido dias depois da conversa).
 */
export async function getChatToSaleConversion(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ summary: ChatConversionSummary | null; errors: string[] }> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) return { summary: null, errors: [] };

  const { chats, errors } = await paginateChats(integration, from, to);

  const chatPhones = new Set<string>();
  for (const chat of chats) {
    const digits = phoneDigits(chat.contact?.phoneNumber);
    if (digits) chatPhones.add(digits);
  }

  if (chatPhones.size === 0) {
    return { summary: { chatsWithContact: 0, matchedSales: 0, matchedRevenue: 0 }, errors };
  }

  const admin = createAdminClient();
  const { data: purchases } = await admin
    .from("purchases")
    .select("telefone, valor")
    .eq("area_id", areaId)
    .eq("status", "approved")
    .not("telefone", "is", null)
    .limit(20_000);

  let matchedSales = 0;
  let matchedRevenue = 0;
  for (const row of purchases ?? []) {
    const digits = phoneDigits(row.telefone as string | null);
    if (digits && chatPhones.has(digits)) {
      matchedSales += 1;
      matchedRevenue += Number(row.valor) || 0;
    }
  }

  return {
    summary: { chatsWithContact: chatPhones.size, matchedSales, matchedRevenue },
    errors,
  };
}

// Nomes exatos dos templates (template_label), confirmados contra o painel
// real da Umbler ("Nome do template" em cada card de Template).
const BUTTON_RESPONSE_TEMPLATES = ["compra_aprovada_v1", "compra_aprovada_v2"];
const BUTTON_RESPONSE_TARGET = "liberar acesso";

const RECOVERY_TEMPLATES = ["compra_cancelada_v1", "compra_recusada_v1", "cadastro_abandonado_v1"];
// Recuperação de carrinho tende a converter rápido ou nunca mais — 7 dias é
// uma janela generosa sem arriscar atribuir uma compra não relacionada.
const RECOVERY_CONVERSION_WINDOW_DAYS = 7;

export type TemplateButtonRate = {
  sends: number;
  clicks: number;
  rate: number | null;
};

/**
 * Taxa de clique num botão ESPECÍFICO (ex.: "Liberar acesso" dos templates
 * compra_aprovada_v1/v2) — diferente de `umbler_template_sends.clicks`, que
 * conta "clicou em QUALQUER botão da mensagem" (ex.: "Falar com suporte"
 * também contaria lá). Vem de `umbler_template_events`, alimentada pelo
 * mesmo cron diário — só tem dado a partir de quando essa tabela existe.
 */
export async function getTemplateButtonClickRate(
  areaId: string,
  from: Date,
  to: Date,
  templateLabels: string[] = BUTTON_RESPONSE_TEMPLATES,
  buttonText: string = BUTTON_RESPONSE_TARGET,
): Promise<TemplateButtonRate> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("umbler_template_events")
    .select("button_clicked")
    .eq("area_id", areaId)
    .in("template_label", templateLabels)
    .gte("sent_at", from.toISOString())
    .lte("sent_at", to.toISOString())
    .limit(20_000);

  const rows = data ?? [];
  const sends = rows.length;
  const target = buttonText.trim().toLowerCase();
  const clicks = rows.filter(
    (r) => (r.button_clicked as string | null)?.trim().toLowerCase() === target,
  ).length;

  return { sends, clicks, rate: sends > 0 ? (clicks / sends) * 100 : null };
}

export type TemplateConversionRate = {
  sends: number;
  conversions: number;
  rate: number | null;
  revenue: number;
};

/**
 * Taxa de conversão dos templates de recuperação de carrinho: de cada envio,
 * quantos tiveram uma compra APROVADA do mesmo telefone dentro de
 * `windowDays` depois do envio. Vem de `umbler_template_events` cruzada com
 * `purchases` — só tem dado a partir de quando essa tabela existe.
 */
export async function getTemplateConversionRate(
  areaId: string,
  from: Date,
  to: Date,
  templateLabels: string[] = RECOVERY_TEMPLATES,
  windowDays: number = RECOVERY_CONVERSION_WINDOW_DAYS,
): Promise<TemplateConversionRate> {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("umbler_template_events")
    .select("contact_phone, sent_at")
    .eq("area_id", areaId)
    .in("template_label", templateLabels)
    .not("contact_phone", "is", null)
    .gte("sent_at", from.toISOString())
    .lte("sent_at", to.toISOString())
    .limit(20_000);

  const rows = events ?? [];
  if (rows.length === 0) return { sends: 0, conversions: 0, rate: null, revenue: 0 };

  // Busca compras aprovadas numa janela um pouco maior que o período (pra
  // pegar conversões de envios no finalzinho do período que só convertem
  // depois do fim dele).
  const purchaseWindowEnd = new Date(to.getTime() + windowDays * 24 * 3600 * 1000);
  const { data: purchases } = await admin
    .from("purchases")
    .select("telefone, valor, created_at")
    .eq("area_id", areaId)
    .eq("status", "approved")
    .not("telefone", "is", null)
    .gte("created_at", from.toISOString())
    .lte("created_at", purchaseWindowEnd.toISOString())
    .limit(20_000);

  const purchasesByPhone = new Map<string, { time: number; valor: number }[]>();
  for (const row of purchases ?? []) {
    const digits = phoneDigits(row.telefone as string | null);
    if (!digits) continue;
    const arr = purchasesByPhone.get(digits) ?? [];
    arr.push({ time: new Date(row.created_at as string).getTime(), valor: Number(row.valor) || 0 });
    purchasesByPhone.set(digits, arr);
  }

  let conversions = 0;
  let revenue = 0;
  for (const row of rows) {
    const digits = phoneDigits(row.contact_phone as string | null);
    if (!digits) continue;
    const sentAt = new Date(row.sent_at as string).getTime();
    const windowEnd = sentAt + windowDays * 24 * 3600 * 1000;
    const match = (purchasesByPhone.get(digits) ?? []).find(
      (p) => p.time >= sentAt && p.time <= windowEnd,
    );
    if (match) {
      conversions += 1;
      revenue += match.valor;
    }
  }

  return {
    sends: rows.length,
    conversions,
    rate: rows.length > 0 ? (conversions / rows.length) * 100 : null,
    revenue,
  };
}

const SUPPORT_BUTTON_TARGET = "falar com suporte";

export type ButtonClickTotal = {
  clicks: number;
  totalSends: number;
};

/**
 * Total de cliques num botão em QUALQUER template (sem filtrar por
 * template_label) — usada pro "Falar com suporte", que aparece em todos os
 * templates que já vimos (compra_aprovada, compra_recusada,
 * cadastro_abandonado, compra_cancelada), diferente das outras duas métricas
 * acima que são específicas de um grupo de templates.
 */
export async function getButtonClickTotal(
  areaId: string,
  from: Date,
  to: Date,
  buttonText: string = SUPPORT_BUTTON_TARGET,
): Promise<ButtonClickTotal> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("umbler_template_events")
    .select("button_clicked")
    .eq("area_id", areaId)
    .gte("sent_at", from.toISOString())
    .lte("sent_at", to.toISOString())
    .limit(20_000);

  const rows = data ?? [];
  const target = buttonText.trim().toLowerCase();
  const clicks = rows.filter(
    (r) => (r.button_clicked as string | null)?.trim().toLowerCase() === target,
  ).length;

  return { clicks, totalSends: rows.length };
}
