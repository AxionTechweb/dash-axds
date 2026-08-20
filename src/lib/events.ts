import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Jornada do lead agrupada pelo ID anônimo do visitante (`user_id` em
 * events_log/visitors — o "SRC" da conversa com o usuário, para não confundir
 * com o parâmetro `src` do Hotmart, que na verdade carrega o ad_id).
 *
 * Usada pela aba "Eventos" de /vendas: em vez de uma lista crua de eventos,
 * uma linha por visitante, com contagem por tipo de evento (para detectar
 * quem entrou várias vezes e ainda não comprou) e as compras já casadas.
 */

const EVENTS_LIMIT = 20_000;

export type VisitorEvent = {
  eventName: string;
  createdAt: string;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  pageUrl: string | null;
};

export type VisitorPurchase = {
  produto: string | null;
  status: string;
  valor: number | null;
  moeda: string | null;
  createdAt: string;
};

export type VisitorJourney = {
  userId: string;
  firstSeen: string;
  lastSeen: string;
  eventCounts: Record<string, number>;
  totalEvents: number;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  events: VisitorEvent[];
  purchases: VisitorPurchase[];
  converted: boolean;
};

/** 3+ page views e nenhuma compra aprovada — o sinal de indecisão que o usuário quer enxergar. */
export function isIndecisive(journey: VisitorJourney): boolean {
  return (journey.eventCounts.page_view ?? 0) >= 3 && !journey.converted;
}

function groupEventsByUser(
  rows: {
    user_id: string;
    event_name: string;
    created_at: string;
    utm_source: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    geo_city: string | null;
    geo_region: string | null;
    geo_country: string | null;
    page_url: string | null;
  }[],
): Map<string, VisitorEvent[]> {
  const byUser = new Map<string, VisitorEvent[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({
      eventName: row.event_name,
      createdAt: row.created_at,
      utmSource: row.utm_source,
      utmCampaign: row.utm_campaign,
      utmContent: row.utm_content,
      geoCity: row.geo_city,
      geoRegion: row.geo_region,
      geoCountry: row.geo_country,
      pageUrl: row.page_url,
    });
    byUser.set(row.user_id, list);
  }
  return byUser;
}

function groupPurchasesByUser(
  rows: {
    user_id: string | null;
    produto: string | null;
    status: string;
    valor: number | string | null;
    moeda: string | null;
    created_at: string;
  }[],
): Map<string, VisitorPurchase[]> {
  const byUser = new Map<string, VisitorPurchase[]>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push({
      produto: row.produto,
      status: row.status,
      valor: row.valor === null ? null : Number(row.valor),
      moeda: row.moeda,
      createdAt: row.created_at,
    });
    byUser.set(row.user_id, list);
  }
  return byUser;
}

const EVENT_COLUMNS =
  "user_id, event_name, created_at, utm_source, utm_campaign, utm_content, geo_city, geo_region, geo_country, page_url";
const PURCHASE_COLUMNS = "user_id, produto, status, valor, moeda, created_at";

export async function getVisitorJourneys(
  areaId: string,
  from: Date,
  to: Date,
): Promise<VisitorJourney[]> {
  const supabase = await createClient();

  const { data: eventRows } = await supabase
    .from("events_log")
    .select(EVENT_COLUMNS)
    .eq("area_id", areaId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: true })
    .limit(EVENTS_LIMIT);

  const rows = eventRows ?? [];
  if (rows.length === 0) return [];

  const byUser = groupEventsByUser(rows);

  const userIds = [...byUser.keys()];
  const { data: purchaseRows } = await supabase
    .from("purchases")
    .select(PURCHASE_COLUMNS)
    .eq("area_id", areaId)
    .in("user_id", userIds)
    .order("created_at", { ascending: true });

  const purchasesByUser = groupPurchasesByUser(purchaseRows ?? []);

  const journeys: VisitorJourney[] = [];
  for (const [userId, events] of byUser) {
    const eventCounts: Record<string, number> = {};
    for (const e of events) eventCounts[e.eventName] = (eventCounts[e.eventName] ?? 0) + 1;

    // Origem: o primeiro evento com UTM preenchida — reflete a entrada original,
    // não a navegação interna que segue sem parâmetros na URL.
    const withUtm = events.find((e) => e.utmSource || e.utmCampaign || e.utmContent);
    const withGeo = [...events].reverse().find((e) => e.geoCity || e.geoRegion);

    const purchases = purchasesByUser.get(userId) ?? [];

    journeys.push({
      userId,
      firstSeen: events[0].createdAt,
      lastSeen: events[events.length - 1].createdAt,
      eventCounts,
      totalEvents: events.length,
      utmSource: withUtm?.utmSource ?? null,
      utmCampaign: withUtm?.utmCampaign ?? null,
      utmContent: withUtm?.utmContent ?? null,
      geoCity: withGeo?.geoCity ?? null,
      geoRegion: withGeo?.geoRegion ?? null,
      events,
      purchases,
      converted: purchases.some((p) => p.status === "approved"),
    });
  }

  // Mais eventos primeiro — é quem esse painel existe para achar.
  journeys.sort((a, b) => b.totalEvents - a.totalEvents);

  return journeys;
}

export type UserJourney = { events: VisitorEvent[]; purchases: VisitorPurchase[] };

/**
 * Jornada completa (SEM filtro de período — todo o histórico) de um conjunto
 * específico de visitantes. Usada pela aba "Compras": ao abrir o detalhe de
 * uma venda, mostra o "Mapa dos Eventos" daquele comprador, mesmo que os
 * acessos tenham acontecido antes do período filtrado na tela.
 */
export async function getJourneysByUserIds(
  areaId: string,
  userIds: string[],
): Promise<Map<string, UserJourney>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = await createClient();

  const [{ data: eventRows }, { data: purchaseRows }] = await Promise.all([
    supabase
      .from("events_log")
      .select(EVENT_COLUMNS)
      .eq("area_id", areaId)
      .in("user_id", ids)
      .order("created_at", { ascending: true })
      .limit(EVENTS_LIMIT),
    supabase
      .from("purchases")
      .select(PURCHASE_COLUMNS)
      .eq("area_id", areaId)
      .in("user_id", ids)
      .order("created_at", { ascending: true }),
  ]);

  const eventsByUser = groupEventsByUser(eventRows ?? []);
  const purchasesByUser = groupPurchasesByUser(purchaseRows ?? []);

  const result = new Map<string, UserJourney>();
  for (const id of ids) {
    const events = eventsByUser.get(id) ?? [];
    const purchases = purchasesByUser.get(id) ?? [];
    if (events.length === 0 && purchases.length === 0) continue;
    result.set(id, { events, purchases });
  }
  return result;
}
