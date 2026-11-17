"use server";

import { z } from "zod";

import { authAttemptAllowed, logAuthEvent } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; ok?: boolean };

const LoginSchema = z.object({
  email: z.email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

/**
 * Login do painel. O cadastro público fica DESLIGADO no Supabase — novos
 * usuários entram por convite (Admin) ou pelo /setup de primeira execução.
 */
export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (!(await authAttemptAllowed("login", parsed.data.email))) {
    await logAuthEvent("auth.login_blocked", parsed.data.email);
    return { error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await logAuthEvent("auth.login_failed", parsed.data.email);
    // Mensagem genérica de propósito (não revela se o e-mail existe).
    return { error: "E-mail ou senha incorretos." };
  }

  await logAuthEvent("auth.login", parsed.data.email);
  return { ok: true };
}
