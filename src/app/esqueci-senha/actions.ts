"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error?: string; ok?: string };

const ForgotPasswordSchema = z.object({
  email: z.email("E-mail inválido."),
});

/**
 * Base pública da instância para o link do e-mail. NUNCA vem dos headers da
 * requisição em produção: X-Forwarded-Host é controlável por quem pede o reset
 * e mandaria o código de recuperação para outro domínio.
 */
async function getBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Vercel injeta o domínio de produção do projeto.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd}`;
  // Só em dev local (sem Vercel) cai no host da requisição.
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
