import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getRequestContext } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública (/api/v1): autenticação por par x-api-key + x-api-secret, um par
 * por área. A chave é pública (identifica a área); o segredo só existe na mão
 * do cliente — no banco fica o sha256 dele, comparado em tempo constante.
 */

/** Requisições por minuto por chave. */
export const RATE_LIMIT_PER_MINUTE = 120;
/** Tentativas com credencial errada por minuto por IP. */
const AUTH_FAILURES_PER_MINUTE = 20;

export type ApiContext = { areaId: string; apiKey: string };

/** Formato de erro único da API: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function apiOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function token(prefix: string, length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}${out}`;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Novo par de credenciais. O segredo em claro só é devolvido aqui. */
export function newCredentials(): { apiKey: string; apiSecret: string; secretHash: string } {
  const apiKey = token("dk_", 24);
  const apiSecret = token("ds_", 40);
  return { apiKey, apiSecret, secretHash: hashSecret(apiSecret) };
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Autentica a requisição. Devolve o contexto da área ou a resposta de erro pronta. */
export async function authenticate(request: Request): Promise<ApiContext | Response> {
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  const apiSecret = request.headers.get("x-api-secret")?.trim() ?? "";
  const ip = getRequestContext(request.headers).ip ?? "unknown";

  // O segredo tem 40 caracteres aleatórios (força bruta é inviável); o limite
  // por IP só evita martelar o banco com credencial errada.
  const fail = async () => {
    if (!(await rateLimit(`api-auth-fail:${ip}`, AUTH_FAILURES_PER_MINUTE, 60))) {
      return apiError(429, "rate_limited", "Muitas tentativas com credencial inválida. Aguarde um minuto.");
    }
    return apiError(401, "unauthorized", "Credenciais inválidas: confira os headers x-api-key e x-api-secret.");
  };

  if (!apiKey || !apiSecret) return fail();

  const admin = createAdminClient();
  const { data } = await admin
    .from("api_credentials")
    .select("area_id, secret_hash, last_used_at")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (!data || !sameHash(hashSecret(apiSecret), data.secret_hash as string)) return fail();

  if (!(await rateLimit(`api:${apiKey}`, RATE_LIMIT_PER_MINUTE, 60))) {
    return apiError(429, "rate_limited", `Limite de ${RATE_LIMIT_PER_MINUTE} requisições por minuto atingido.`);
  }

  // Marca o uso no máximo 1x por minuto (evita um UPDATE por requisição).
  const last = data.last_used_at ? Date.parse(data.last_used_at as string) : 0;
  if (Date.now() - last > 60_000) {
    await admin
      .from("api_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("area_id", data.area_id as string);
  }

  return { areaId: data.area_id as string, apiKey };
}

/** Corpo JSON da requisição, ou a resposta 400 pronta. */
export async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError(400, "invalid_body", "O corpo precisa ser um objeto JSON.");
    }
    return body as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid_json", "Corpo da requisição não é um JSON válido.");
  }
}
