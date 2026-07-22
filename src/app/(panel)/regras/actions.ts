"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type RuleState = { error?: string; ok?: string };

const RuleSchema = z.object({
  nome: z.string().trim().min(1, "Informe um nome."),
  nivel: z.enum(["campanha", "conjunto", "anuncio"]),
  metric: z.string().trim().min(1),
  operator: z.enum([">", "<"]),
  value: z.coerce.number(),
  period: z.enum(["today", "yesterday", "7d", "30d"]),
  action: z.enum(["pausar", "notificar"]),
});

async function requireArea() {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." as const };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." as const };
  return { user, area };
}

export async function saveRule(
  _prev: RuleState,
  formData: FormData,
): Promise<RuleState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = RuleSchema.safeParse({
    nome: formData.get("nome"),
    nivel: formData.get("nivel"),
    metric: formData.get("metric"),
    operator: formData.get("operator"),
    value: formData.get("value"),
    period: formData.get("period"),
    action: formData.get("action"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();

  const row = { ...parsed.data, area_id: ctx.area.id };

  const { error } = id
    ? await admin.from("automation_rules").update(row).eq("id", id)
    : await admin.from("automation_rules").insert(row);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await admin.from("audit_log").insert({
    area_id: ctx.area.id,
    actor_email: ctx.user.email ?? null,
    action: id ? "rule.update" : "rule.create",
    target_type: "rule",
    details: { nome: parsed.data.nome },
  });

  revalidatePath("/regras");
  return { ok: "Regra salva." };
}

export async function toggleRule(formData: FormData) {
  const ctx = await requireArea();
  if ("error" in ctx) return;

  const id = String(formData.get("id") ?? "");
  const ativa = String(formData.get("ativa") ?? "") === "true";
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("automation_rules").update({ ativa }).eq("id", id);

  revalidatePath("/regras");
}

export async function deleteRule(formData: FormData) {
  const ctx = await requireArea();
  if ("error" in ctx) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("automation_rules").delete().eq("id", id);

  await admin.from("audit_log").insert({
    area_id: ctx.area.id,
    actor_email: ctx.user.email ?? null,
    action: "rule.delete",
    target_type: "rule",
    target_id: id,
    details: {},
  });

  revalidatePath("/regras");
}
