import "server-only";

/**
 * CORS dos endpoints públicos de captura, controlado pelos `allowed_origins`
 * da ÁREA (configurável no painel).
 *
 * Regras:
 *  - Requisição sem `Origin` (server-to-server, curl) não é cross-origin do
 *    browser: passa, protegida pelo token da área + rate limit.
 *  - Com `Origin`: só passa se casar com a lista da área. Lista VAZIA nega
 *    tudo — é o estado "ainda não configurado", e o erro é explícito para
 *    facilitar o diagnóstico no console do navegador.
 *  - Suporta curinga de subdomínio: "*.exemplo.com".
 */

function normalize(value: string): string {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function matches(origin: string, pattern: string): boolean {
  const o = normalize(origin);
  const p = normalize(pattern);
  if (!p) return false;
  if (p === o) return true;

  // "*.exemplo.com" casa com "https://qualquer.exemplo.com"
  if (p.includes("*.")) {
    const bare = p.replace(/^https?:\/\//, "").replace("*.", "");
    try {
      const host = new URL(o).hostname;
      return host === bare || host.endsWith(`.${bare}`);
    } catch {
      return false;
    }
  }

  // Permite cadastrar só o domínio, sem esquema.
  if (!p.startsWith("http")) {
    try {
      return new URL(o).hostname === p;
    } catch {
      return false;
    }
  }

  return false;
}

export function isOriginAllowed(
  origin: string | null,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true; // sem Origin => não é cross-origin de browser
  return allowedOrigins.some((pattern) => matches(origin, pattern));
}

/** Headers de CORS para uma origem já validada. */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
