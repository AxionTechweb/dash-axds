import "server-only";

import { headers } from "next/headers";

import { getRequestContext } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";
import { sha256Hex } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Freio contra força bruta nas telas sem login (login, esqueci a senha, setup).
 * Conta por IP E por e-mail: trocar de IP não libera mais tentativas pro mesmo
 * e-mail, e um IP não consegue varrer vários e-mails.
 */
const LIMITS = {
  login: { ip: [10, 15 * 60], email: [5, 15 * 60] },
  reset: { ip: [10, 60 * 60], email: [3, 60 * 60] },
  setup: { ip: [5, 15 * 60], email: [5, 15 * 60] },
} as const;

export type GuardKind = keyof typeof LIMITS;

export async function clientIp(): Promise<string> {
  return getRequestContext(await headers()).ip ?? "unknown";
}

/** `true` = pode seguir; `false` = passou do limite. */
export async function authAttemptAllowed(kind: GuardKind, email?: string): Promise<boolean> {
  const ip = await clientIp();
  const lim = LIMITS[kind];
  const byIp = await rateLimit(`auth:${kind}:ip:${ip}`, lim.ip[0], lim.ip[1]);
  if (!byIp) return false;
  if (!email) return true;
  // E-mail vai como hash na chave (a tabela de rate limit não guarda PII).
  const key = await sha256Hex(email.trim().toLowerCase());
  return rateLimit(`auth:${kind}:email:${key}`, lim.email[0], lim.email[1]);
}

/** Registra login (ok/falha/bloqueado) no audit_log. Nunca derruba o fluxo. */
export async function logAuthEvent(
  action: "auth.login" | "auth.login_failed" | "auth.login_blocked" | "auth.reset_requested" | "auth.password_changed",
  email: string | null,
): Promise<void> {
  try {
    await createAdminClient()
      .from("audit_log")
      .insert({
        actor_email: email,
        action,
        target_type: "user",
        target_id: email,
        details: { ip: await clientIp() },
      });
  } catch (e) {
    console.error("[auth-guard] audit_log:", e instanceof Error ? e.message : e);
  }
}
