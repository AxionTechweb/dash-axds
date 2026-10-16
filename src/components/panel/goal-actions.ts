"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Atualiza só a meta de faturamento da área ATIVA (nunca recebe o area_id do
 * cliente — deriva da sessão via getActiveArea, mesmo padrão de requireArea
 * em integracoes/actions.ts, pra ninguém editar a meta de outra área).
 */
export async function updateRevenueGoal(
  value: number,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." };

  if (!Number.isFinite(value) || value < 0) {
    return { error: "Valor inválido." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({ revenue_goal: value })
    .eq("area_id", area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  revalidatePath("/", "layout");
  return { ok: true };
}
