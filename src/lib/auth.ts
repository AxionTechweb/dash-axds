import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Usuário autenticado do PAINEL (auth.users do Supabase).
 * Não confundir com o `user_id` de visitante (anônimo, ver src/lib/ids.ts).
 *
 * Usa getUser(), que revalida o token no servidor de Auth — nunca confie em
 * getSession() para autorização no servidor.
 */
export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/** Nome de exibição do usuário (fallback: parte local do e-mail). */
export function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return "";
  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return user.email?.split("@")[0] ?? "";
}
