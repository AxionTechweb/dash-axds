"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error?: string; ok?: string };

const ForgotPasswordSchema = z.object({
  email: z.email("E-mail inválido."),
});

/** Base pública da instância — mesmo helper usado em Integrações. */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Dispara o e-mail de redefinição de senha. Mensagem de sucesso SEMPRE
 * genérica (mesmo se o e-mail não existir) — não revela quais e-mails têm
 * conta, mesmo espírito do erro genérico do login.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const baseUrl = await getBaseUrl();
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${baseUrl}/auth/confirm?next=/redefinir-senha`,
  });

  return {
    ok: "Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.",
  };
}
