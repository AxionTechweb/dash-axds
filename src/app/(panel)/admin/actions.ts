"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminState = { error?: string; ok?: string };

/**
 * Gestão de usuários do painel. O cadastro público continua DESLIGADO —
 * novos usuários entram apenas por convite enviado daqui (Supabase Admin API).
 */
const InviteSchema = z.object({
  email: z.email("E-mail inválido."),
});

export async function inviteUser(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const parsed = InviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email);

  if (error) {
    return { error: `Falha ao convidar: ${error.message}` };
  }

  await admin.from("audit_log").insert({
    actor_email: user.email ?? null,
    action: "user.invite",
    target_type: "user",
    target_id: parsed.data.email,
    details: {},
  });

  revalidatePath("/admin");
  return { ok: `Convite enviado para ${parsed.data.email}.` };
}

export async function removeUser(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const targetId = String(formData.get("userId") ?? "");
  if (!targetId) return { error: "Usuário não informado." };

  // Impede remover a própria conta (evita ficar sem acesso ao painel).
  if (targetId === user.id) {
    return { error: "Você não pode remover a própria conta." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await admin.from("audit_log").insert({
    actor_email: user.email ?? null,
    action: "user.delete",
    target_type: "user",
    target_id: targetId,
    details: {},
  });

  revalidatePath("/admin");
  return { ok: "Usuário removido." };
}
