import "server-only";

import { getGa4Integration } from "./client";
import { GA4_API_BASE } from "./config";

/**
 * Relatório "página de destino", últimos 28 dias — mesmo recorte que o
 * usuário já olha na UI do GA4.
 *
 * "Tempo médio de engajamento por sessão" NÃO é a métrica `averageSessionDuration`
 * da API (validado contra a propriedade real: dava um valor bem diferente do
 * mostrado na UI) — é `userEngagementDuration ÷ sessions`, calculado aqui.
 */

export type Ga4LandingPageRow = {
  /** "(total)" para a linha de agregado — o resto é o path da página. */
  landingPage: string;
  sessions: number;
  activeUsers: number;
  newUsers: number;
  avgEngagementSeconds: number | null;
  keyEvents: number;
  totalRevenue: number;
  keyEventRate: number | null;
};

type MetricValue = { value?: string };
type ReportRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: MetricValue[];
};

const METRICS = [
  "sessions",
  "activeUsers",
  "newUsers",
  "userEngagementDuration",
  "keyEvents",
  "totalRevenue",
  "sessionKeyEventRate",
] as const;

function toNumber(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToLandingPage(landingPage: string, metricValues: MetricValue[] | undefined): Ga4LandingPageRow {
  const values = metricValues ?? [];
  const sessions = toNumber(values[0]?.value);
  const userEngagementDuration = toNumber(values[3]?.value);

  return {
    landingPage,
    sessions,
    activeUsers: toNumber(values[1]?.value),
    newUsers: toNumber(values[2]?.value),
    avgEngagementSeconds: sessions > 0 ? userEngagementDuration / sessions : null,
    keyEvents: toNumber(values[4]?.value),
    totalRevenue: toNumber(values[5]?.value),
    keyEventRate: values[6]?.value !== undefined ? toNumber(values[6]?.value) : null,
  };
}

export async function getLandingPageReport(
  areaId: string,
): Promise<{ rows: Ga4LandingPageRow[]; errors: string[] }> {
  const integration = await getGa4Integration(areaId);
  if (!integration) return { rows: [], errors: [] };

  try {
    const res = await fetch(
      `${GA4_API_BASE}/properties/${integration.propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          dimensions: [{ name: "landingPage" }],
          metrics: METRICS.map((name) => ({ name })),
          metricAggregations: ["TOTAL"],
          limit: 500,
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { rows: [], errors: [body?.error?.message ?? `HTTP ${res.status}`] };
    }

    const data = (await res.json()) as {
      rows?: ReportRow[];
      totals?: ReportRow[];
    };

    const rows = (data.rows ?? []).map((row) =>
      rowToLandingPage(row.dimensionValues?.[0]?.value ?? "(não definido)", row.metricValues),
    );

    const total = data.totals?.[0];
    if (total) {
      rows.unshift(rowToLandingPage("(total)", total.metricValues));
    }

    return { rows, errors: [] };
  } catch (err) {
    return {
      rows: [],
      errors: [err instanceof Error ? err.message : "falha na requisição"],
    };
  }
}
