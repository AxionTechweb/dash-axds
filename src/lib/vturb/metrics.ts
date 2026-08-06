import "server-only";

import { extractAdId } from "@/lib/webhooks/parse";

import { getVturbAccount, getVturbPlayers, toVturbDateTime, vturbPost } from "./client";
import { VTURB_HOOK_THRESHOLD_SECONDS } from "./config";
import { discoverVturbPlayers } from "./discover";

/**
 * Métricas de VSL por criativo, vindas da Analytics API da Vturb.
 *
 * O casamento com o `ad_id` da Meta usa o MESMO mecanismo já validado para a
 * PayT (`extractAdId`, src/lib/webhooks/parse.ts): o `utm_content` chega na
 * Vturb como `"<nome-do-criativo>|<ad_id>"` (confirmado num teste real contra
 * a API — `grouped_field` vem exatamente nesse formato), e `extractAdId`
 * separa por `_|,;:-\s/` e mantém só o segmento puramente numérico.
 *
 * Duas chamadas por player, batidas contra a API real:
 *  1) `/traffic_origin/stats` (query_key=utm_content) — plays, play_rate,
 *     cliques de CTA e retenção do pitch, JÁ agregados por criativo.
 *  2) `/times/user_engagement_by_traffic_origin`, com todos os valores de (1)
 *     em lote — curva de retenção por segundo assistido, usada para calcular
 *     o Hook Rate (não vem pronto em nenhum endpoint).
 */

export type VturbRow = {
  playerId: string;
  plays: number;
  playRate: number | null;
  ctaClicks: number;
  /** % de sessões que ultrapassaram o `pitch_time` do vídeo. */
  pitchRetention: number | null;
  /** % de sessões ainda assistindo em VTURB_HOOK_THRESHOLD_SECONDS. */
  hookRate: number | null;
};

export type VturbByAd = Map<string, VturbRow>;

type TrafficOriginStatsRow = {
  grouped_field: string;
  total_started_session_uniq: number;
  total_clicked_session_uniq: number;
  play_rate: number | string | null;
  over_pitch_rate: number | string | null;
};

type EngagementByOriginRow = {
  group_key: string;
  group_values: { timed: number; totalUsers: number }[];
};

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hook rate = fração dos usuários cujo ponto mais distante assistido é >= o
 * limiar do gancho. `group_values` é um histograma esparso (um bucket por
 * usuário, no segundo em que ele foi visto pela última vez) — não é uma
 * série densa por segundo, então soma-se por limiar em vez de indexar por
 * posição exata.
 */
function hookRateFrom(groupValues: EngagementByOriginRow["group_values"]): number | null {
  if (!groupValues || groupValues.length === 0) return null;

  let total = 0;
  let retained = 0;
  for (const { timed, totalUsers } of groupValues) {
    total += totalUsers;
    if (timed >= VTURB_HOOK_THRESHOLD_SECONDS) retained += totalUsers;
  }

  return total > 0 ? (retained / total) * 100 : null;
}

export async function getVturbByAd(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ byAd: VturbByAd; errors: string[] }> {
  const byAd: VturbByAd = new Map();
  const errors: string[] = [];

  const account = await getVturbAccount(areaId);
  if (!account) return { byAd, errors };

  const players = await getVturbPlayers(areaId);
  if (players.length === 0) return { byAd, errors };

  // video_duration/pitch_time são exigidos pelo endpoint de retenção (2) e
  // não ficam salvos em vturb_players (evita duplicar o que a Vturb já sabe
  // de cada vídeo) — busca uma vez por rodada via /players/list.
  const discovered = await discoverVturbPlayers(areaId, account.apiKey);
  if (!discovered.ok) errors.push(`Vturb (metadados dos vídeos): ${discovered.error}`);
  const playerMeta = new Map(
    discovered.ok ? discovered.players.map((p) => [p.id, p]) : [],
  );

  const startDate = toVturbDateTime(from, false);
  const endDate = toVturbDateTime(to, true);

  for (const player of players) {
    const meta = playerMeta.get(player.playerId);
    const durationParams = meta
      ? { video_duration: meta.duration, pitch_time: meta.pitchTime }
      : {};

    const statsResult = await vturbPost<TrafficOriginStatsRow[]>(
      account,
      "/traffic_origin/stats",
      {
        player_id: player.playerId,
        query_key: "utm_content",
        start_date: startDate,
        end_date: endDate,
        timezone: "America/Sao_Paulo",
        ...durationParams,
      },
    );

    if (statsResult.error) {
      errors.push(`${player.label}: ${statsResult.error}`);
      continue;
    }

    // ad_id → (grouped_field original, linha) — o grouped_field original é
    // reusado como "value" na chamada de retenção logo abaixo.
    const rowsByAdId = new Map<
      string,
      { groupedField: string; row: TrafficOriginStatsRow }
    >();
    for (const row of statsResult.data ?? []) {
      const adId = extractAdId(row.grouped_field, "last");
      if (!adId) continue; // utm_content sem ad_id numérico — não atribuível a um criativo
      rowsByAdId.set(adId, { groupedField: row.grouped_field, row });
    }

    if (rowsByAdId.size === 0) continue;

    const groupedFields = [...rowsByAdId.values()].map((v) => v.groupedField);
    const engagementResult = await vturbPost<EngagementByOriginRow[]>(
      account,
      "/times/user_engagement_by_traffic_origin",
      {
        player_id: player.playerId,
        query_key: "utm_content",
        values: groupedFields,
        start_date: startDate,
        end_date: endDate,
        timezone: "America/Sao_Paulo",
        ...durationParams,
      },
    );

    if (engagementResult.error) {
      errors.push(`${player.label}: ${engagementResult.error}`);
    }

    const hookRateByGroupedField = new Map<string, number | null>();
    for (const group of engagementResult.data ?? []) {
      hookRateByGroupedField.set(group.group_key, hookRateFrom(group.group_values));
    }

    for (const [adId, { groupedField, row }] of rowsByAdId) {
      // Um ad_id aparecendo em mais de um player (raro — um anúncio deveria
      // levar a uma única VSL) fica com o último player processado.
      byAd.set(adId, {
        playerId: player.playerId,
        plays: Number(row.total_started_session_uniq) || 0,
        playRate: toNumberOrNull(row.play_rate),
        ctaClicks: Number(row.total_clicked_session_uniq) || 0,
        pitchRetention: toNumberOrNull(row.over_pitch_rate),
        hookRate: hookRateByGroupedField.get(groupedField) ?? null,
      });
    }
  }

  return { byAd, errors };
}
