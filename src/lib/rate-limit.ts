import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting em Postgres (função rate_limit_hit). Compatível com serverless
 * (Vercel) — sem estado em memória. Usar nos endpoints públicos (captura/webhooks).
 *
 * Retorna `true` se a requisição está DENTRO do limite; `false` se excedeu.
 * Em caso de erro no banco, faz "fail open" (permite) para não derrubar a captura,
 * mas registra no console para observabilidade.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data as boolean;
  } catch (err) {
    console.error("[rate-limit] falha ao consultar rate_limit_hit:", err);
    return true; // fail open
  }
}
