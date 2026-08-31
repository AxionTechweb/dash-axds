import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Atribuição LAST CLICK a partir dos DADOS PRÓPRIOS, sempre por `ad_id` exato
 * (nunca por nome de campanha).
 *
 * - Vendas/Faturamento: `purchases` aprovadas com ad_id.
 * - Checkouts: eventos `initiate_checkout` cujo utm_content é o ad_id.
 */
export type LastClickRow = {
  sales: number;
  revenue: number;
  checkouts: number;
};

export type LastClickMap = Map<string, LastClickRow>;

function emptyRow(): LastClickRow {
  return { sales: 0, revenue: 0, checkouts: 0 };
}

export async function getLastClickByAd(
  areaId: string,
  from: Date,
  to: Date,
): Promise<LastClickMap> {
  const map: LastClickMap = new Map();

  try {
    const supabase = await createClient();

    const [purchases, events] = await Promise.all([
      supabase
        .from("purchases")
        .select("ad_id, valor")
        .eq("area_id", areaId)
        .eq("status", "approved")
        .not("ad_id", "is", null)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(20_000),
      supabase
        .from("events_log")
        .select("utm_content")
        .eq("area_id", areaId)
        .eq("event_name", "initiate_checkout")
        .not("utm_content", "is", null)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(50_000),
    ]);

    for (const row of purchases.data ?? []) {
      const adId = row.ad_id as string | null;
      if (!adId) continue;
      const entry = map.get(adId) ?? emptyRow();
      entry.sales += 1;
      entry.revenue += Number(row.valor) || 0;
      map.set(adId, entry);
    }

    for (const row of events.data ?? []) {
      const adId = row.utm_content as string | null;
      // Só conta como checkout de anúncio se o utm_content for um ad_id.
      if (!adId || !/^\d{5,25}$/.test(adId)) continue;
      const entry = map.get(adId) ?? emptyRow();
      entry.checkouts += 1;
      map.set(adId, entry);
    }
  } catch {
    return map;
  }

  return map;
}

export type ProductTier = "vd" | "upsell" | "downsell" | "outro";

export type WeeklySalesRow = {
  sales: number;
  revenue: number;
  byTier: Record<ProductTier, { sales: number; revenue: number }>;
  refundValue: number;
  chargebackValue: number;
  canceledCount: number;
  /** Compradores distintos (email, com telefone como fallback) entre as vendas aprovadas. */
  uniqueBuyers: number;
};

export type WeeklySalesByAd = Map<string, WeeklySalesRow>;

function emptyWeeklySalesRow(): WeeklySalesRow {
  return {
    sales: 0,
    revenue: 0,
    byTier: {
      vd: { sales: 0, revenue: 0 },
      upsell: { sales: 0, revenue: 0 },
      downsell: { sales: 0, revenue: 0 },
      outro: { sales: 0, revenue: 0 },
    },
    refundValue: 0,
    chargebackValue: 0,
    canceledCount: 0,
    uniqueBuyers: 0,
  };
}

/**
 * Vendas aprovadas por `ad_id`, com a receita também quebrada por tier de
 * produto (`product_tiers` — produto sem mapeamento cai em "outro", nunca
 * quebra o cálculo). Usada pelo relatório semanal (src/lib/reports/weekly.ts).
 *
 * Usa o client ADMIN (service_role) em vez do SSR (`createClient`) porque
 * roda a partir do cron semanal — sem sessão de usuário nos cookies, a RLS
 * ("authenticated read") devolveria zero linhas.
 */
export async function getWeeklySalesByAdAndTier(
  areaId: string,
  from: Date,
  to: Date,
): Promise<WeeklySalesByAd> {
  const map: WeeklySalesByAd = new Map();
  const buyersByAd = new Map<string, Set<string>>();

  try {
    const admin = createAdminClient();

    const [purchases, tiers] = await Promise.all([
      admin
        .from("purchases")
        .select("ad_id, valor, produto, status, email, telefone")
        .eq("area_id", areaId)
        .in("status", ["approved", "refunded", "chargeback", "canceled"])
        .not("ad_id", "is", null)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(20_000),
      admin.from("product_tiers").select("produto, tier").eq("area_id", areaId),
    ]);

    const tierByProduct = new Map(
      (tiers.data ?? []).map((row) => [row.produto as string, row.tier as ProductTier]),
    );

    for (const row of purchases.data ?? []) {
      const adId = row.ad_id as string | null;
      if (!adId) continue;

      const value = Number(row.valor) || 0;
      const status = row.status as string;
      const entry = map.get(adId) ?? emptyWeeklySalesRow();

      if (status === "approved") {
        const tier = tierByProduct.get((row.produto as string) ?? "") ?? "outro";
        entry.sales += 1;
        entry.revenue += value;
        entry.byTier[tier].sales += 1;
        entry.byTier[tier].revenue += value;

        const buyerKey = (row.email as string | null) ?? (row.telefone as string | null);
        if (buyerKey) {
          const buyers = buyersByAd.get(adId) ?? new Set<string>();
          buyers.add(buyerKey);
          buyersByAd.set(adId, buyers);
        }
      } else if (status === "refunded") {
        entry.refundValue += value;
      } else if (status === "chargeback") {
        entry.chargebackValue += value;
      } else if (status === "canceled") {
        entry.canceledCount += 1;
      }

      map.set(adId, entry);
    }

    for (const [adId, buyers] of buyersByAd) {
      const entry = map.get(adId);
      if (entry) entry.uniqueBuyers = buyers.size;
    }
  } catch {
    return map;
  }

  return map;
}

/** Totais de page_view e checkouts do período (para o funil). */
export async function getFunnelBase(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ views: number; checkouts: number }> {
  try {
    const supabase = await createClient();

    const [views, checkouts] = await Promise.all([
      supabase
        .from("events_log")
        .select("id", { count: "exact", head: true })
        .eq("area_id", areaId)
        .eq("event_name", "page_view")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString()),
      supabase
        .from("events_log")
        .select("id", { count: "exact", head: true })
        .eq("area_id", areaId)
        .eq("event_name", "initiate_checkout")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString()),
    ]);

    return {
      views: views.count ?? 0,
      checkouts: checkouts.count ?? 0,
    };
  } catch {
    return { views: 0, checkouts: 0 };
  }
}

export type CartRecoveryMetrics = {
  /** Vendas aprovadas cujo comprador tinha um abandono de checkout ANTES dela. */
  count: number;
  revenue: number;
};

/**
 * Recuperação de carrinho: compradores (email, com telefone como fallback)
 * que abandonaram o checkout (`status = 'abandoned'`) e depois voltaram e
 * finalizaram a compra (`status = 'approved'`, criada DEPOIS do abandono).
 * Usada em /dashboard e /umbler — WhatsApp (Umbler Talk) é hoje o único
 * canal de recuperação deste negócio, daí o nome da métrica, mas o cálculo
 * em si não depende da API da Umbler (é só cruzamento de status próprio).
 *
 * O abandono pode ter acontecido antes do período selecionado (o cliente
 * some por dias e volta) — por isso busca abandonos em TODO o histórico,
 * mas só conta como recuperação a venda aprovada que caiu dentro do período.
 */
export async function getCartRecoveryMetrics(
  areaId: string,
  from: Date,
  to: Date,
): Promise<CartRecoveryMetrics> {
  try {
    const supabase = await createClient();

    const [abandoned, approved] = await Promise.all([
      supabase
        .from("purchases")
        .select("email, telefone, created_at")
        .eq("area_id", areaId)
        .eq("status", "abandoned")
        .lte("created_at", to.toISOString())
        .limit(20_000),
      supabase
        .from("purchases")
        .select("email, telefone, valor, created_at")
        .eq("area_id", areaId)
        .eq("status", "approved")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(20_000),
    ]);

    const buyerKey = (row: { email?: string | null; telefone?: string | null }) =>
      row.email ?? row.telefone ?? null;

    // Guarda o abandono MAIS ANTIGO por comprador — só precisa de um ponto
    // de referência pra checar "a aprovação veio depois de algum abandono".
    const earliestAbandonByBuyer = new Map<string, number>();
    for (const row of abandoned.data ?? []) {
      const key = buyerKey(row);
      if (!key) continue;
      const at = new Date(row.created_at as string).getTime();
      const current = earliestAbandonByBuyer.get(key);
      if (current === undefined || at < current) earliestAbandonByBuyer.set(key, at);
    }

    let count = 0;
    let revenue = 0;
    for (const row of approved.data ?? []) {
      const key = buyerKey(row);
      if (!key) continue;
      const abandonedAt = earliestAbandonByBuyer.get(key);
      if (abandonedAt === undefined) continue;
      if (new Date(row.created_at as string).getTime() <= abandonedAt) continue;

      count += 1;
      revenue += Number(row.valor) || 0;
    }

    return { count, revenue };
  } catch {
    return { count: 0, revenue: 0 };
  }
}
