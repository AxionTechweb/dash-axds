import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import { VTURB_API_BASE, VTURB_API_VERSION, VTURB_RATE_LIMIT } from "./config";

/**
 * Cliente de baixo nível da Analytics API da Vturb — mesmo espírito de
 * src/lib/meta/client.ts: nunca lança, sempre devolve erro estruturado, para
 * uma falha na Vturb nunca derrubar o relatório.
 */

export type VturbAccount = {
  areaId: string;
  apiKey: string;
};

export type VturbPlayer = {
  playerId: string;
  label: string;
};

/** Credencial da área, com a api_key já decifrada. SOMENTE no servidor. */
export async function getVturbAccount(
  areaId: string,
): Promise<VturbAccount | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vturb_integrations")
    .select("api_key, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.api_key) return null;

  try {
    const apiKey = await decryptSecret(data.api_key);
    return { areaId, apiKey };
  } catch (err) {
    console.error("[vturb] falha ao decifrar api_key:", err);
    return null;
  }
}

/** Vídeos (players) monitorados da área. */
export async function getVturbPlayers(areaId: string): Promise<VturbPlayer[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vturb_players")
    .select("player_id, label")
    .eq("area_id", areaId);

  if (error || !data) return [];
  return data.map((row) => ({ playerId: row.player_id, label: row.label }));
}

export type VturbFetchResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/**
 * POST autenticado na Analytics API. Rate limit em Postgres, mesma função já
 * usada pela Meta (`rate_limit_hit`). Nunca lança.
 */
export async function vturbPost<T>(
  account: VturbAccount,
  path: string,
  body: Record<string, unknown>,
): Promise<VturbFetchResult<T>> {
  const allowed = await rateLimit(
    `vturb:${account.areaId}`,
    VTURB_RATE_LIMIT.max,
    VTURB_RATE_LIMIT.windowSeconds,
  );
  if (!allowed) return { data: null, error: "rate limit interno atingido" };

  try {
    const response = await fetch(`${VTURB_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Token": account.apiKey,
        "X-Api-Version": VTURB_API_VERSION,
      },
      body: JSON.stringify(body),
      // A atribuição do relatório é sempre de uma semana fechada — sem cache,
      // o cron roda 1x por semana por área.
      cache: "no-store",
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        data: null,
        error: errBody?.error ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/** GET autenticado (ex.: `/players/list`). Mesmo contrato de `vturbPost`. */
export async function vturbGet<T>(
  account: VturbAccount,
  path: string,
  query?: Record<string, string>,
): Promise<VturbFetchResult<T>> {
  const allowed = await rateLimit(
    `vturb:${account.areaId}`,
    VTURB_RATE_LIMIT.max,
    VTURB_RATE_LIMIT.windowSeconds,
  );
  if (!allowed) return { data: null, error: "rate limit interno atingido" };

  const qs = query ? `?${new URLSearchParams(query)}` : "";

  try {
    const response = await fetch(`${VTURB_API_BASE}${path}${qs}`, {
      method: "GET",
      headers: {
        "X-Api-Token": account.apiKey,
        "X-Api-Version": VTURB_API_VERSION,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        data: null,
        error: errBody?.error ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/** "YYYY-MM-DD HH:mm:ss" — formato exigido pela Analytics API da Vturb. */
export function toVturbDateTime(date: Date, endOfDay: boolean): string {
  const ymd = date.toISOString().slice(0, 10);
  return `${ymd} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}
