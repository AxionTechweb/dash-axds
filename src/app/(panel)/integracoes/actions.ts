"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { testAdAccountConnection } from "@/lib/meta/test-connection";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string };

/**
 * Configuração das integrações. Todo segredo é CIFRADO (pgcrypto) antes de ir
 * para o banco; o painel nunca exibe o valor em claro, só se está configurado.
 */
async function requireArea() {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." as const };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." as const };
  return { user, area };
}

async function audit(
  areaId: string,
  actorEmail: string | undefined,
  action: string,
  details: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "integration",
      details,
    });
  } catch {
    // auditoria não derruba a operação
  }
}

/* ------------------------------------------------------------- settings */

const SettingsSchema = z.object({
  currency: z.string().trim().length(3, "Use o código de 3 letras (ex.: BRL)."),
  tax_rate: z.coerce.number().min(0).max(100),
  revenue_goal: z.coerce.number().min(0),
  allowed_origins: z.string(),
});

export async function saveSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = SettingsSchema.safeParse({
    currency: formData.get("currency"),
    tax_rate: formData.get("tax_rate"),
    revenue_goal: formData.get("revenue_goal"),
    allowed_origins: formData.get("allowed_origins") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Uma origem por linha.
  const origins = parsed.data.allowed_origins
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({
      currency: parsed.data.currency.toUpperCase(),
      tax_rate: parsed.data.tax_rate,
      revenue_goal: parsed.data.revenue_goal,
      allowed_origins: origins,
    })
    .eq("area_id", ctx.area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.settings", {
    currency: parsed.data.currency,
    tax_rate: parsed.data.tax_rate,
    origins: origins.length,
  });

  revalidatePath("/integracoes");
  return { ok: "Preferências salvas." };
}

/* ------------------------------------------------- segredos de webhook */

export async function saveWebhookSecret(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const platform = String(formData.get("platform") ?? "");
  const value = String(formData.get("value") ?? "").trim();

  const column =
    platform === "hotmart"
      ? "hotmart_hottok"
      : platform === "kiwify"
        ? "kiwify_webhook_token"
        : null;

  if (!column) return { error: "Plataforma inválida." };

  const admin = createAdminClient();

  // Campo vazio remove o segredo (desconecta a integração).
  const payload = value ? await encryptSecret(value) : null;

  const { error } = await admin
    .from("settings")
    .update({ [column]: payload })
    .eq("area_id", ctx.area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.webhook_secret", {
    platform,
    removed: !value,
  });

  revalidatePath("/integracoes");
  return { ok: value ? "Token salvo e cifrado." : "Token removido." };
}

/* ------------------------------------------------ contas de anúncio Meta */

const AccountSchema = z.object({
  label: z.string().trim().min(1, "Informe um rótulo."),
  ad_account_id: z
    .string()
    .trim()
    .regex(/^(act_)?\d{5,25}$/, "ID da conta inválido (ex.: act_1234567890)."),
  ads_token: z.string().trim().min(20, "Informe o token de System User."),
});

export async function saveAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = AccountSchema.safeParse({
    label: formData.get("label"),
    ad_account_id: formData.get("ad_account_id"),
    ads_token: formData.get("ads_token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Valida token e escopos ANTES de salvar.
  const test = await testAdAccountConnection(
    parsed.data.ads_token,
    parsed.data.ad_account_id,
  );
  if (!test.ok) {
    return { error: test.error ?? "Não foi possível validar a conexão." };
  }

  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const encrypted = await encryptSecret(parsed.data.ads_token);

  const row = {
    area_id: ctx.area.id,
    label: parsed.data.label,
    ad_account_id: parsed.data.ad_account_id,
    ads_token: encrypted,
  };

  const { error } = id
    ? await admin.from("meta_ad_accounts").update(row).eq("id", id)
    : await admin.from("meta_ad_accounts").insert(row);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account", {
    label: parsed.data.label,
    account: parsed.data.ad_account_id,
    updated: Boolean(id),
  });

  revalidatePath("/integracoes");
  return {
    ok: `Conta “${test.accountName ?? parsed.data.label}” conectada e validada.`,
  };
}

export async function deleteAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Conta não informada." };

  const admin = createAdminClient();
  const { error } = await admin.from("meta_ad_accounts").delete().eq("id", id);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account_delete", { id });

  revalidatePath("/integracoes");
  return { ok: "Conta removida." };
}

/** Testa a conexão sem salvar (botão "Testar conexão"). */
export async function testConnection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  const account = String(formData.get("ad_account_id") ?? "").trim();

  if (!token || !account) {
    return { error: "Informe o ID da conta e o token para testar." };
  }

  const test = await testAdAccountConnection(token, account);

  if (!test.ok) return { error: test.error ?? "Falha na conexão." };

  return {
    ok: `OK — ${test.accountName ?? account} (${test.accountCurrency ?? "?"}). Escopos: ${test.scopes?.join(", ")}`,
  };
}
