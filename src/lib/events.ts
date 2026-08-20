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

export async function getVisitorJourneys(
  areaId: string,
  from: Date,
  to: Date,
): Promise<VisitorJourney[]> {
  const supabase = await createClient();

  const { data: eventRows } = await supabase
    .from("events_log")
    .select(
      "user_id, event_name, created_at, utm_source, utm_campaign, utm_content, geo_city, geo_region, geo_country",
    )
    .eq("area_id", areaId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: true })
    .limit(EVENTS_LIMIT);

  const rows = eventRows ?? [];
  if (rows.length === 0) return [];

  const byUser = new Map<string, VisitorEvent[]>();
  for (const row of rows) {
    const userId = row.user_id as string;
    const list = byUser.get(userId) ?? [];
    list.push({
      eventName: row.event_name as string,
      createdAt: row.created_at as string,
      utmSource: row.utm_source as string | null,
      utmCampaign: row.utm_campaign as string | null,
      utmContent: row.utm_content as string | null,
      geoCity: row.geo_city as string | null,
      geoRegion: row.geo_region as string | null,
      geoCountry: row.geo_country as string | null,
    });
    byUser.set(userId, list);
  }

  const userIds = [...byUser.keys()];
  const { data: purchaseRows } = await supabase
    .from("purchases")
    .select("user_id, produto, status, valor, moeda, created_at")
    .eq("area_id", areaId)
    .in("user_id", userIds)
    .order("created_at", { ascending: true });

  const purchasesByUser = new Map<string, VisitorPurchase[]>();
  for (const row of purchaseRows ?? []) {
    const userId = row.user_id as string | null;
    if (!userId) continue;
    const list = purchasesByUser.get(userId) ?? [];
    list.push({
      produto: row.produto as string | null,
      status: row.status as string,
      valor: row.valor === null ? null : Number(row.valor),
      moeda: row.moeda as string | null,
      createdAt: row.created_at as string,
    });
    purchasesByUser.set(userId, list);
  }

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
