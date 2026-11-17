import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — recebe o link do e-mail (reset de senha ou convite,
 * enviado pelo Resend) e troca o token de uso único por uma sessão (cookie)
 * antes de mandar pra frente. Links antigos do Supabase (`?code=`) também caem
 * aqui e são recusados (token desconhecido).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") ;
  // Só caminho interno: "//host" ou "/\host" levariam para outro domínio.
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : "/dashboard";

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
