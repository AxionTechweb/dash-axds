import "server-only";

import { vturbGet } from "./client";

/**
 * Descoberta de players a partir da API key — mesmo espírito de
 * discoverAdAccounts (src/lib/meta/discover.ts): o usuário cola a chave uma
 * vez, o painel lista TODOS os vídeos que ela enxerga (GET /players/list) e
 * ele marca quais monitorar. A chave nunca volta ao cliente por aqui.
 */

export type DiscoveredPlayer = {
  id: string;
  name: string;
  duration: number;
  pitchTime: number;
};

export type DiscoverPlayersResult =
  | { ok: true; players: DiscoveredPlayer[] }
  | { ok: false; error: string };

type PlayersListRow = {
  id?: string;
  name?: string;
  duration?: number;
  pitch_time?: number;
};

export async function discoverVturbPlayers(
  areaId: string,
  apiKey: string,
): Promise<DiscoverPlayersResult> {
  const clean = apiKey.trim();
  if (!clean) return { ok: false, error: "Informe a API key." };

  const result = await vturbGet<PlayersListRow[]>(
    { areaId, apiKey: clean },
    "/players/list",
  );

  if (result.error) {
    return { ok: false, error: `Chave inválida ou API indisponível: ${result.error}` };
  }

  const players: DiscoveredPlayer[] = (result.data ?? [])
    .filter((row): row is Required<Pick<PlayersListRow, "id" | "name">> & PlayersListRow =>
      Boolean(row.id && row.name),
    )
    .map((row) => ({
      id: row.id!,
      name: row.name!,
      duration: Number(row.duration) || 0,
      pitchTime: Number(row.pitch_time) || 0,
    }));

  if (players.length === 0) {
    return {
      ok: false,
      error: "A chave é válida, mas não enxerga nenhum vídeo.",
    };
  }

  players.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { ok: true, players };
}
