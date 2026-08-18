import "server-only";

import { getVturbAccount, toVturbDateTime, vturbPost } from "./client";
import { discoverVturbPlayers } from "./discover";

/**
 * Dados do painel /vturb — visão "ao vivo" de UM vídeo (não é o relatório por
 * criativo de src/lib/vturb/metrics.ts, que cruza com ad_id da Meta). Sem
 * snapshot no Supabase: a página chama a Analytics API a cada carregamento.
 *
 * Período "todo o histórico do vídeo" — sem filtro de data, igual ao painel
 * nativo da Vturb quando nenhum range é escolhido. Usamos uma data de início
 * bem antiga como aproximação, já que a API exige start_date/end_date.
 */
const ALL_TIME_START = "2020-01-01 00:00:00";

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
): Promise<{ stats: VturbPlayerStats | null; error: string | null }> {
  const account = await getVturbAccount(areaId);
  if (!account) return { stats: null, error: "Vturb não conectado nesta área." };

  const endDate = toVturbDateTime(new Date(), true);
  const result = await vturbPost<SessionsStatsResponse>(account, "/sessions/stats", {
    player_id: playerId,
    start_date: ALL_TIME_START,
    end_date: endDate,
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
): Promise<{ points: VturbRetentionPoint[]; error: string | null }> {
  const account = await getVturbAccount(areaId);
  if (!account) return { points: [], error: "Vturb não conectado nesta área." };

  const discovered = await discoverVturbPlayers(areaId, account.apiKey);
  const meta = discovered.ok ? discovered.players.find((p) => p.id === playerId) : undefined;

  const endDate = toVturbDateTime(new Date(), true);
  const result = await vturbPost<EngagementResponse | EngagementResponse[]>(
    account,
    "/times/user_engagement",
    {
      player_id: playerId,
      start_date: ALL_TIME_START,
      end_date: endDate,
      timezone: "America/Sao_Paulo",
      ...(meta ? { video_duration: meta.duration, pitch_time: meta.pitchTime } : {}),
    },
  );

  if (result.error) return { points: [], error: result.error };

  const raw = result.data;
  const buckets = Array.isArray(raw) ? (raw[0]?.grouped_timed ?? []) : (raw?.grouped_timed ?? []);
  if (buckets.length === 0) return { points: [], error: null };

  const sorted = [...buckets].sort((a, b) => a.timed - b.timed);
  const total = sorted.reduce((sum, b) => sum + (Number(b.total_users) || 0), 0);
  if (total === 0) return { points: [], error: null };

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

  return { points, error: null };
}
