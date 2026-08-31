import "server-only";

import { getVturbAccount, toVturbDateTime, vturbPost } from "./client";
import { discoverVturbPlayers } from "./discover";

/**
 * Dados do painel /vturb — visão "ao vivo" de UM vídeo (não é o relatório por
 * criativo de src/lib/vturb/metrics.ts, que cruza com ad_id da Meta). Sem
 * snapshot no Supabase: a página chama a Analytics API a cada carregamento,
 * com o MESMO período do seletor de data do cabeçalho (compartilhado com o
 * resto do painel).
 */

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------- tiles */

export type VturbPlayerStats = {
  views: number;
  uniqueViews: number;
  plays: number;
  uniquePlays: number;
  playRate: number | null;
  pitchRetention: number | null;
  pitchAudience: number;
  engagementRate: number | null;
  buttonClicks: number;
  conversions: number;
  conversionRate: number | null;
  revenue: number;
};

type SessionsStatsResponse = {
  total_viewed?: number;
  total_viewed_session_uniq?: number;
  total_started?: number;
  total_started_session_uniq?: number;
  total_clicked_session_uniq?: number;
  over_pitch_rate?: number | string | null;
  total_over_pitch?: number;
  engagement_rate?: number | string | null;
  total_conversions?: number;
  overall_conversion_rate?: number | string | null;
  play_rate?: number | string | null;
  total_amount_brl?: number;
};

export async function getPlayerStats(
  areaId: string,
  playerId: string,
  from: Date,
  to: Date,
): Promise<{ stats: VturbPlayerStats | null; error: string | null }> {
  const account = await getVturbAccount(areaId);
  if (!account) return { stats: null, error: "Vturb não conectado nesta área." };

  const result = await vturbPost<SessionsStatsResponse>(account, "/sessions/stats", {
    player_id: playerId,
    start_date: toVturbDateTime(from, false),
    end_date: toVturbDateTime(to, true),
    timezone: "America/Sao_Paulo",
  });

  if (result.error) return { stats: null, error: result.error };
  const data = result.data ?? {};

  return {
    error: null,
    stats: {
      views: Number(data.total_viewed) || 0,
      uniqueViews: Number(data.total_viewed_session_uniq) || 0,
      plays: Number(data.total_started) || 0,
      uniquePlays: Number(data.total_started_session_uniq) || 0,
      playRate: toNumberOrNull(data.play_rate),
      pitchRetention: toNumberOrNull(data.over_pitch_rate),
      pitchAudience: Number(data.total_over_pitch) || 0,
      engagementRate: toNumberOrNull(data.engagement_rate),
      buttonClicks: Number(data.total_clicked_session_uniq) || 0,
      conversions: Number(data.total_conversions) || 0,
      conversionRate: toNumberOrNull(data.overall_conversion_rate),
      // A API devolve o valor em centavos (ex.: 324900 = R$3.249,00).
      revenue: (Number(data.total_amount_brl) || 0) / 100,
    },
  };
}

/* ---------------------------------------------------- retention curve */

export type VturbRetentionPoint = { seconds: number; retentionPercent: number };

/**
 * Contagens BRUTAS em pontos fixos do funil (pedido explícito do usuário
 * pra esta página): reprodução aos 3s ("gancho"), e 25/50/75% da DURAÇÃO do
 * vídeo. São números absolutos, não percentuais — os KPIs da página dividem
 * pelo denominador que fizer sentido pra cada um (impressões pro gancho,
 * a própria contagem do gancho pras retenções seguintes), diferente do
 * `retentionPercent` de `points` (que é sempre relativo ao TOTAL de sessões).
 *
 * NOTA: o limiar de gancho aqui é 3s, fixo por pedido do usuário — não usa
 * `VTURB_HOOK_THRESHOLD_SECONDS` (5s), que é do relatório semanal por
 * criativo (métrica diferente, mesmo nome).
 */
export type VturbFunnelCounts = {
  countAt3s: number;
  countAt25: number;
  countAt50: number;
  countAt75: number;
  avgWatchSeconds: number | null;
};

type EngagementResponse = { grouped_timed?: { timed: number; total_users: number }[] };

/**
 * `grouped_timed` é um histograma esparso: cada bucket é o ponto mais
 * distante (em segundos) que aquele grupo de usuários assistiu — não uma
 * série densa por segundo. A curva de retenção é a soma cumulativa reversa:
 * % de usuários cujo ponto mais distante foi >= cada instante.
 */
export async function getPlayerRetentionCurve(
  areaId: string,
  playerId: string,
  from: Date,
  to: Date,
): Promise<{ points: VturbRetentionPoint[]; funnel: VturbFunnelCounts | null; error: string | null }> {
  const account = await getVturbAccount(areaId);
  if (!account) return { points: [], funnel: null, error: "Vturb não conectado nesta área." };

  const discovered = await discoverVturbPlayers(areaId, account.apiKey);
  const meta = discovered.ok ? discovered.players.find((p) => p.id === playerId) : undefined;

  const result = await vturbPost<EngagementResponse | EngagementResponse[]>(
    account,
    "/times/user_engagement",
    {
      player_id: playerId,
      start_date: toVturbDateTime(from, false),
      end_date: toVturbDateTime(to, true),
      timezone: "America/Sao_Paulo",
      ...(meta ? { video_duration: meta.duration, pitch_time: meta.pitchTime } : {}),
    },
  );

  if (result.error) return { points: [], funnel: null, error: result.error };

  const raw = result.data;
  const buckets = Array.isArray(raw) ? (raw[0]?.grouped_timed ?? []) : (raw?.grouped_timed ?? []);
  if (buckets.length === 0) return { points: [], funnel: null, error: null };

  const sorted = [...buckets].sort((a, b) => a.timed - b.timed);
  const total = sorted.reduce((sum, b) => sum + (Number(b.total_users) || 0), 0);
  if (total === 0) return { points: [], funnel: null, error: null };

  let runningFromEnd = 0;
  const reversed = [...sorted].reverse().map((bucket) => {
    runningFromEnd += Number(bucket.total_users) || 0;
    return { seconds: bucket.timed, retainedUsers: runningFromEnd };
  });
  reversed.reverse();

  const points: VturbRetentionPoint[] = reversed.map(({ seconds, retainedUsers }) => ({
    seconds,
    retentionPercent: (retainedUsers / total) * 100,
  }));

  const duration = meta?.duration ?? null;
  const countAtOrAbove = (threshold: number) =>
    sorted.reduce((sum, b) => sum + (b.timed >= threshold ? Number(b.total_users) || 0 : 0), 0);
  const weightedSum = sorted.reduce((sum, b) => sum + b.timed * (Number(b.total_users) || 0), 0);

  const funnel: VturbFunnelCounts | null = duration
    ? {
        countAt3s: countAtOrAbove(3),
        countAt25: countAtOrAbove(duration * 0.25),
        countAt50: countAtOrAbove(duration * 0.5),
        countAt75: countAtOrAbove(duration * 0.75),
        avgWatchSeconds: weightedSum / total,
      }
    : null;

  return { points, funnel, error: null };
}

/* -------------------------------------------------------- traffic origin */

export type VturbOriginRow = {
  source: string;
  views: number;
  uniqueViews: number;
  plays: number;
  uniquePlays: number;
  playRate: number | null;
  conversions: number;
  conversionRate: number | null;
  revenue: number;
};

type TrafficOriginStatsRow = {
  grouped_field?: string;
  total_viewed?: number;
  total_viewed_session_uniq?: number;
  total_started?: number;
  total_started_session_uniq?: number;
  total_conversions?: number;
  overall_conversion_rate?: number | string | null;
  play_rate?: number | string | null;
  total_amount_brl?: number;
};

/**
 * Mesmo endpoint usado no relatório semanal por criativo (`/traffic_origin/stats`),
 * mas agrupado por `utm_source` em vez de `utm_content` — valida"do contra a
 * API real: devolve exatamente as mesmas métricas, só que por origem
 * ("FB", "direto", etc.) em vez de por ad_id.
 */
export async function getPlayerTrafficOrigin(
  areaId: string,
  playerId: string,
  from: Date,
  to: Date,
): Promise<{ rows: VturbOriginRow[]; error: string | null }> {
  const account = await getVturbAccount(areaId);
  if (!account) return { rows: [], error: "Vturb não conectado nesta área." };

  const discovered = await discoverVturbPlayers(areaId, account.apiKey);
  const meta = discovered.ok ? discovered.players.find((p) => p.id === playerId) : undefined;

  const result = await vturbPost<TrafficOriginStatsRow[]>(account, "/traffic_origin/stats", {
    player_id: playerId,
    query_key: "utm_source",
    start_date: toVturbDateTime(from, false),
    end_date: toVturbDateTime(to, true),
    timezone: "America/Sao_Paulo",
    ...(meta ? { video_duration: meta.duration, pitch_time: meta.pitchTime } : {}),
  });

  if (result.error) return { rows: [], error: result.error };

  const rows: VturbOriginRow[] = (result.data ?? [])
    .filter((row): row is TrafficOriginStatsRow & { grouped_field: string } =>
      Boolean(row.grouped_field),
    )
    .map((row) => ({
      source: row.grouped_field,
      views: Number(row.total_viewed) || 0,
      uniqueViews: Number(row.total_viewed_session_uniq) || 0,
      plays: Number(row.total_started) || 0,
      uniquePlays: Number(row.total_started_session_uniq) || 0,
      playRate: toNumberOrNull(row.play_rate ?? null),
      conversions: Number(row.total_conversions) || 0,
      conversionRate: toNumberOrNull(row.overall_conversion_rate ?? null),
      revenue: (Number(row.total_amount_brl) || 0) / 100,
    }))
    .sort((a, b) => b.views - a.views);

  return { rows, error: null };
}
