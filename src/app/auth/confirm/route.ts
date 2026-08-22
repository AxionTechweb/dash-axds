import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — recebe o link de confirmação/recuperação do e-mail da
 * Supabase e troca por uma sessão de verdade (cookie) antes de mandar pra
 * frente. Esse projeto usa o fluxo PKCE (confirmado num link real: vem
 * `?code=...`, não `token_hash`+`type`) — `exchangeCodeForSession` é o
 * caminho principal; `verifyOtp` fica como fallback pra outros fluxos.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }

  redirect("/login?error=link_invalido");
}
