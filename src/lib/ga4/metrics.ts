import "server-only";

import { getGa4Integration, type Ga4Integration } from "./client";
import { GA4_API_BASE } from "./config";

/**
 * Relatórios do GA4, últimos 28 dias — mesmo recorte que o usuário já olha
 * na UI do GA4. Duas visões, mesma credencial:
 *  - "página de destino" (getLandingPageReport)
 *  - "aquisição de tráfego" por origem da sessão (getSessionSourceReport)
 *
 * "Tempo médio de engajamento por sessão" NÃO é a métrica `averageSessionDuration`
 * da API (validado contra a propriedade real: dava um valor bem diferente do
 * mostrado na UI) — é `userEngagementDuration ÷ sessions`, calculado aqui.
 */

type MetricValue = { value?: string };
type ReportRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: MetricValue[];
};
type ReportResponse = { rows?: ReportRow[]; totals?: ReportRow[] };

function toNumber(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** POST genérico em `:runReport` — nunca lança, erro vira `{error}`. */
async function runReport(
  integration: Ga4Integration,
  body: Record<string, unknown>,
): Promise<{ data: ReportResponse | null; error: string | null }> {
  try {
    const res = await fetch(
      `${GA4_API_BASE}/properties/${integration.propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { data: null, error: errBody?.error?.message ?? `HTTP ${res.status}` };
    }

    return { data: (await res.json()) as ReportResponse, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/* ---------------------------------------------------- página de destino */

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

const LANDING_PAGE_METRICS = [
  "sessions",
  "activeUsers",
  "newUsers",
  "userEngagementDuration",
  "keyEvents",
  "totalRevenue",
  "sessionKeyEventRate",
] as const;

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

  const { data, error } = await runReport(integration, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "landingPage" }],
    metrics: LANDING_PAGE_METRICS.map((name) => ({ name })),
    metricAggregations: ["TOTAL"],
    limit: 500,
  });

  if (error || !data) return { rows: [], errors: [error ?? "falha desconhecida"] };

  const rows = (data.rows ?? []).map((row) =>
    rowToLandingPage(row.dimensionValues?.[0]?.value ?? "(não definido)", row.metricValues),
  );

  const total = data.totals?.[0];
  if (total) rows.unshift(rowToLandingPage("(total)", total.metricValues));

  return { rows, errors: [] };
}

/* ------------------------------------------------------ origem da sessão */

export type Ga4SessionSourceRow = {
  /** "(total)" para a linha de agregado — o resto é a origem (ex.: "FB"). */
  source: string;
  activeUsers: number;
  sessions: number;
  engagedSessions: number;
  avgEngagementSeconds: number | null;
  engagedSessionsPerUser: number | null;
  eventsPerSession: number | null;
  engagementRate: number | null;
  keyEvents: number;
  eventCount: number;
  totalRevenue: number;
};

const SESSION_SOURCE_METRICS = [
  "activeUsers",
  "sessions",
  "engagedSessions",
  "userEngagementDuration",
  "eventsPerSession",
  "engagementRate",
  "keyEvents",
  "eventCount",
  "totalRevenue",
] as const;

function rowToSessionSource(source: string, metricValues: MetricValue[] | undefined): Ga4SessionSourceRow {
  const values = metricValues ?? [];
  const activeUsers = toNumber(values[0]?.value);
  const sessions = toNumber(values[1]?.value);
  const engagedSessions = toNumber(values[2]?.value);
  const userEngagementDuration = toNumber(values[3]?.value);

  return {
    source,
    activeUsers,
    sessions,
    engagedSessions,
    avgEngagementSeconds: sessions > 0 ? userEngagementDuration / sessions : null,
    engagedSessionsPerUser: activeUsers > 0 ? engagedSessions / activeUsers : null,
    eventsPerSession: values[4]?.value !== undefined ? toNumber(values[4]?.value) : null,
    engagementRate: values[5]?.value !== undefined ? toNumber(values[5]?.value) : null,
    keyEvents: toNumber(values[6]?.value),
    eventCount: toNumber(values[7]?.value),
    totalRevenue: toNumber(values[8]?.value),
  };
}

export async function getSessionSourceReport(
  areaId: string,
): Promise<{ rows: Ga4SessionSourceRow[]; errors: string[] }> {
  const integration = await getGa4Integration(areaId);
  if (!integration) return { rows: [], errors: [] };

  const { data, error } = await runReport(integration, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionSource" }],
    metrics: SESSION_SOURCE_METRICS.map((name) => ({ name })),
    metricAggregations: ["TOTAL"],
    limit: 500,
  });

  if (error || !data) return { rows: [], errors: [error ?? "falha desconhecida"] };

  const rows = (data.rows ?? []).map((row) =>
    rowToSessionSource(row.dimensionValues?.[0]?.value ?? "(não definido)", row.metricValues),
  );

  const total = data.totals?.[0];
  if (total) rows.unshift(rowToSessionSource("(total)", total.metricValues));

  return { rows, errors: [] };
}

/* ------------------------------------------------- origem/mídia da sessão */

export type Ga4SourceMediumRow = {
  sourceMedium: string;
  sessions: number;
};

export async function getSourceMediumReport(
  areaId: string,
): Promise<{ rows: Ga4SourceMediumRow[]; errors: string[] }> {
  const integration = await getGa4Integration(areaId);
  if (!integration) return { rows: [], errors: [] };

  const { data, error } = await runReport(integration, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionSourceMedium" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 500,
  });

  if (error || !data) return { rows: [], errors: [error ?? "falha desconhecida"] };

  const rows = (data.rows ?? []).map((row) => ({
    sourceMedium: row.dimensionValues?.[0]?.value ?? "(não definido)",
    sessions: toNumber(row.metricValues?.[0]?.value),
  }));

  return { rows, errors: [] };
}
