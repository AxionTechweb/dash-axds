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
