"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica de propósito (não revela se o e-mail existe).
    return { error: "E-mail ou senha incorretos." };
  }

  redirect("/dashboard");
}
