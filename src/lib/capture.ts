import "server-only";

import { corsHeaders, isOriginAllowed } from "@/lib/cors";
import { getRequestContext, type RequestContext } from "@/lib/geo";
import { resolveAreaByToken, type PublicArea } from "@/lib/public-area";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Guarda comum dos endpoints públicos de captura:
 * resolve a área pelo token, valida CORS pelos allowed_origins e aplica o
 * rate limit (em Postgres) por área + IP.
 */
export type Guard =
  | {
      ok: true;
      area: PublicArea;
      ctx: RequestContext;
      headers: Record<string, string>;
    }
  | { ok: false; response: Response };

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Normaliza string vazia/undefined para null (o SQL usa coalesce). */
export function norm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Token da área: query (?a=) ou corpo. */
export function tokenFrom(request: Request, body?: { a?: unknown }): string {
  const fromQuery = new URL(request.url).searchParams.get("a");
  if (fromQuery) return fromQuery;
  return typeof body?.a === "string" ? body.a : "";
}

export async function guardCapture(
  request: Request,
  token: string,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<Guard> {
  const origin = request.headers.get("origin");

  if (!token) {
    return {
      ok: false,
      response: json({ error: "missing_area_token" }, 400),
    };
  }

  const area = await resolveAreaByToken(token);
  if (!area) {
    return { ok: false, response: json({ error: "area_not_found" }, 404) };
  }

  if (!isOriginAllowed(origin, area.allowedOrigins)) {
    return {
      ok: false,
      response: json(
        {
          error: "origin_not_allowed",
          hint: "Cadastre este domínio em Integrações → origens permitidas (CORS) da área.",
        },
        403,
      ),
    };
  }

  const ctx = getRequestContext(request.headers);
  const allowed = await rateLimit(
    `${bucket}:${token}:${ctx.ip ?? "unknown"}`,
    max,
    windowSeconds,
  );

  if (!allowed) {
    return {
      ok: false,
      response: json({ error: "rate_limited" }, 429, corsHeaders(origin)),
    };
  }

  return { ok: true, area, ctx, headers: corsHeaders(origin) };
}

/** Preflight compartilhado (o token vem em ?a=). */
export async function handlePreflight(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const token = new URL(request.url).searchParams.get("a") ?? "";
  const area = token ? await resolveAreaByToken(token) : null;

  if (!area || !isOriginAllowed(origin, area.allowedOrigins)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
