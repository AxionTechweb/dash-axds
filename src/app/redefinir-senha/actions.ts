"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error?: string };

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

/**
 * Grava a nova senha. Só funciona com a sessão de recuperação criada pelo
 * /auth/confirm (link do e-mail) — sem ela, updateUser falha porque não há
 * usuário autenticado nos cookies da requisição.
 */
export async function updatePassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Link expirado ou inválido. Peça um novo link em \"Esqueceu a senha?\".",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: `Não foi possível atualizar a senha: ${error.message}` };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=ok");
}
