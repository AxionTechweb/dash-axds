import "server-only";

import { classifySaleByValue } from "@/lib/sale-value-tier";
import { createClient } from "@/lib/supabase/server";

/**
 * Métricas a partir dos DADOS PRÓPRIOS (purchases capturadas por webhook).
 * É a base da atribuição "Last Click". O gasto de mídia vem da Meta.
 */

export type DailyPoint = {
  date: string;
  revenue: number;
  spend: number;
  sales: number;
};

export type RegionRow = {
  country: string | null;
  region: string | null;
  sales: number;
  revenue: number;
};

export type RecentSale = {
  id: string;
  produto: string | null;
  valor: number | null;
  created_at: string;
};

export type WeekdayPoint = { label: string; count: number };
export type HourPoint = { hour: number; count: number };

export type PaymentMethodRow = { method: string; count: number };

export type ProductRow = {
  produto: string | null;
  sales: number;
  revenue: number;
};

/** Vendas com ad_id (pagas, atribuídas a um anúncio) vs sem (orgânicas). */
export type OriginSplit = { paid: number; organic: number };

export type PurchaseMetrics = {
  revenue: number;
  sales: number;
  /** Clientes distintos (por e-mail) entre as vendas aprovadas. */
  uniqueSales: number;
  refundedCount: number;
  refundedValue: number;
  chargebackCount: number;
  chargebackValue: number;
  pendingCount: number;
  /** Vendas aprovadas por valor exato (R$97 = downsell, R$297 = upsell). */
  upsellCount: number;
  upsellRevenue: number;
  downsellCount: number;
  downsellRevenue: number;
  /** Faturamento por dia (o gasto é preenchido depois, com dados da Meta). */
  daily: DailyPoint[];
  regions: RegionRow[];
  products: ProductRow[];
  origin: OriginSplit;
  paymentMethods: PaymentMethodRow[];
  recent: RecentSale[];
};

export const EMPTY_METRICS: PurchaseMetrics = {
  revenue: 0,
  sales: 0,
  uniqueSales: 0,
  refundedCount: 0,
  refundedValue: 0,
  chargebackCount: 0,
  chargebackValue: 0,
  pendingCount: 0,
  upsellCount: 0,
  upsellRevenue: 0,
  downsellCount: 0,
  downsellRevenue: 0,
  daily: [],
  regions: [],
  products: [],
  origin: { paid: 0, organic: 0 },
  paymentMethods: [],
  recent: [],
};

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Todos os dias do intervalo, para o gráfico não ter buracos. */
function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= to && days.length < 400) {
    days.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

type PurchaseRow = {
  id: string;
  created_at: string;
  valor: number | null;
  status: string;
  produto: string | null;
  email: string | null;
  ad_id: string | null;
  payment_method: string | null;
  geo_country: string | null;
  geo_region: string | null;
};

export async function getPurchaseMetrics(
  areaId: string,
  from: Date,
  to: Date,
): Promise<PurchaseMetrics> {
  let rows: PurchaseRow[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchases")
      .select(
        "id, created_at, valor, status, produto, email, ad_id, payment_method, geo_country, geo_region",
      )
      .eq("area_id", areaId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(10_000);

    if (error || !data) return EMPTY_METRICS;
    rows = data as PurchaseRow[];
  } catch {
    return EMPTY_METRICS;
  }

  const metrics: PurchaseMetrics = {
    ...EMPTY_METRICS,
    daily: [],
    regions: [],
    products: [],
    origin: { paid: 0, organic: 0 },
    paymentMethods: [],
    recent: [],
  };

  const revenueByDay = new Map<string, number>();
  const salesByDay = new Map<string, number>();
  const regionMap = new Map<string, RegionRow>();
  const productMap = new Map<string, ProductRow>();
  const paymentMethodCounts = new Map<string, number>();
  // Cliente distinto = e-mail normalizado; sem e-mail, a própria venda conta
  // como única (não dá pra agrupar o que não veio no webhook).
  const uniqueCustomers = new Set<string>();

  for (const row of rows) {
    const value = Number(row.valor) || 0;

    switch (row.status) {
      case "approved": {
        metrics.revenue += value;
        metrics.sales += 1;
        uniqueCustomers.add(row.email?.trim().toLowerCase() || `__no_email_${row.id}`);

        const valueTier = classifySaleByValue(value);
        if (valueTier === "upsell") {
          metrics.upsellCount += 1;
          metrics.upsellRevenue += value;
        } else if (valueTier === "downsell") {
          metrics.downsellCount += 1;
          metrics.downsellRevenue += value;
        }

        if (row.ad_id) metrics.origin.paid += 1;
        else metrics.origin.organic += 1;

        if (row.payment_method) {
          paymentMethodCounts.set(
            row.payment_method,
            (paymentMethodCounts.get(row.payment_method) ?? 0) + 1,
          );
        }

        const day = row.created_at.slice(0, 10);
        revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + value);
        salesByDay.set(day, (salesByDay.get(day) ?? 0) + 1);

        const productKey = row.produto ?? "__sem_produto";
        const product = productMap.get(productKey) ?? {
          produto: row.produto,
          sales: 0,
          revenue: 0,
        };
        product.sales += 1;
        product.revenue += value;
        productMap.set(productKey, product);

        const key = `${row.geo_country ?? "?"}|${row.geo_region ?? "?"}`;
        const region = regionMap.get(key) ?? {
          country: row.geo_country,
          region: row.geo_region,
          sales: 0,
          revenue: 0,
        };
        region.sales += 1;
        region.revenue += value;
        regionMap.set(key, region);
        break;
      }
      case "refunded":
        metrics.refundedCount += 1;
        metrics.refundedValue += value;
        break;
      case "chargeback":
        metrics.chargebackCount += 1;
        metrics.chargebackValue += value;
        break;
      case "pending":
        metrics.pendingCount += 1;
        break;
    }
  }

  metrics.uniqueSales = uniqueCustomers.size;

  metrics.daily = daysBetween(from, to).map((date) => ({
    date,
    revenue: revenueByDay.get(date) ?? 0,
    spend: 0,
    sales: salesByDay.get(date) ?? 0,
  }));

  metrics.regions = [...regionMap.values()].sort((a, b) => b.sales - a.sales);
  metrics.products = [...productMap.values()].sort((a, b) => b.sales - a.sales);
  metrics.paymentMethods = [...paymentMethodCounts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);

  metrics.recent = rows
    .filter((r) => r.status === "approved")
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      produto: r.produto,
      valor: r.valor,
      created_at: r.created_at,
    }));

  return metrics;
}

/**
 * Faturamento aprovado no intervalo — versão leve, para a barra de progresso
 * da meta no header (que é mensal e independe do período selecionado).
 */
export async function getRevenueTotal(
  areaId: string,
  from: Date,
  to: Date,
): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchases")
      .select("valor")
      .eq("area_id", areaId)
      .eq("status", "approved")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .limit(10_000);

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  } catch {
    return 0;
  }
}

const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  Monday: "Seg",
  Tuesday: "Ter",
  Wednesday: "Qua",
  Thursday: "Qui",
  Friday: "Sex",
  Saturday: "Sáb",
  Sunday: "Dom",
};

/**
 * Vendas aprovadas por dia da semana e por hora do dia, sempre no fuso de
 * Brasília — independe do fuso do servidor (Vercel roda em UTC), senão o
 * pico de vendas apareceria deslocado.
 */
export async function getSalesTiming(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ weekday: WeekdayPoint[]; hour: HourPoint[] }> {
  const emptyWeekday = WEEKDAY_ORDER.map((day) => ({
    label: WEEKDAY_LABELS[day],
    count: 0,
  }));
  const emptyHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchases")
      .select("created_at")
      .eq("area_id", areaId)
      .eq("status", "approved")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .limit(10_000);

    if (error || !data) return { weekday: emptyWeekday, hour: emptyHour };

    const weekdayCounts = new Map<string, number>();
    const hourCounts = new Array(24).fill(0);

    for (const row of data as { created_at: string }[]) {
      const date = new Date(row.created_at);

      const weekdayName = date.toLocaleDateString("en-US", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
      });
      weekdayCounts.set(weekdayName, (weekdayCounts.get(weekdayName) ?? 0) + 1);

      const hourStr = date.toLocaleString("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false,
      });
      // Alguns motores ICU devolvem "24" para meia-noite em vez de "00".
      const hour = Number(hourStr.replace(/\D/g, "")) % 24;
      hourCounts[hour] += 1;
    }

    return {
      weekday: WEEKDAY_ORDER.map((day) => ({
        label: WEEKDAY_LABELS[day],
        count: weekdayCounts.get(day) ?? 0,
      })),
      hour: emptyHour.map((point) => ({ ...point, count: hourCounts[point.hour] })),
    };
  } catch {
    return { weekday: emptyWeekday, hour: emptyHour };
  }
}

/** Junta o gasto diário da Meta na série de faturamento. */
export function mergeDailySpend(
  daily: DailyPoint[],
  dailySpend: Record<string, number>,
): DailyPoint[] {
  return daily.map((point) => ({
    ...point,
    spend: dailySpend[point.date] ?? 0,
  }));
}
