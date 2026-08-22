import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — recebe o link de confirmação/recuperação do e-mail da
 * Supabase (`{{ .ConfirmationURL }}` do template padrão redireciona pra cá
 * com `token_hash`+`type`), troca por uma sessão de verdade (cookie) e manda
 * pra frente. Mesma receita oficial da Supabase pro App Router com
 * @supabase/ssr — cobre tanto confirmação de convite quanto recuperação de
 * senha, sem precisar mexer no template de e-mail do projeto.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=link_invalido");
}
