"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import {
  getMetaWaIntegration,
  normalizePhone,
  sendMetaTemplate,
} from "@/lib/meta-wa/client";
import { DISPATCH_TRIGGERS, PARAM_KEYS } from "@/lib/meta-wa/constants";
import { processDispatchQueue, resolveParams } from "@/lib/meta-wa/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string };
export type AudienceState = { total?: number; error?: string };

const MAX_CAMPAIGN = 500;

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
    await createAdminClient().from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "dispatch",
      details,
    });
  } catch {
    // auditoria não derruba a operação
  }
}

/** "nome|idioma" vindo do select de templates. */
function parseTemplate(value: string): { name: string; language: string } | null {
  const [name, language] = value.split("|");
  if (!name || !language) return null;
  if (!/^[a-z0-9_]+$/.test(name) || !/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) return null;
  return { name, language };
}

function parseParams(formData: FormData): string[] | null {
  const keys = formData.getAll("param").map(String).filter(Boolean);
  return keys.every((k) => PARAM_KEYS.includes(k)) ? keys : null;
}

/* ------------------------------------------------------------------ regras */

/** Salva a regra de um gatilho. Só dispara se o usuário marcar "ligada". */
export async function saveDispatchRule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const trigger = String(formData.get("trigger") ?? "");
  if (!DISPATCH_TRIGGERS.some((t) => t.id === trigger)) return { error: "Gatilho inválido." };

  const template = parseTemplate(String(formData.get("template") ?? ""));
  if (!template) return { error: "Escolha um template aprovado." };

  const params = parseParams(formData);
  if (!params) return { error: "Variável inválida." };

  const delay = Number(formData.get("delay_minutes") ?? 0);
  if (!Number.isInteger(delay) || delay < 0 || delay > 10080) {
    return { error: "Atraso deve estar entre 0 e 10080 minutos." };
  }

  const enabled = formData.get("enabled") === "on";

  const { error } = await createAdminClient()
    .from("wa_dispatch_rules")
    .upsert(
      {
        area_id: ctx.area.id,
        trigger,
        template_name: template.name,
        template_language: template.language,
        body_params: params,
        delay_minutes: delay,
        enabled,
      },
      { onConflict: "area_id,trigger" },
    );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "dispatch.rule_save", {
    trigger,
    template: template.name,
    delay,
    enabled,
  });
  revalidatePath("/disparos");
  return { ok: enabled ? "Regra salva e LIGADA." : "Regra salva (desligada)." };
}

export async function deleteDispatchRule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const trigger = String(formData.get("trigger") ?? "");
  const { error } = await createAdminClient()
    .from("wa_dispatch_rules")
    .delete()
    .eq("area_id", ctx.area.id)
    .eq("trigger", trigger);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "dispatch.rule_delete", { trigger });
  revalidatePath("/disparos");
  return { ok: "Regra removida." };
}

/* ------------------------------------------------------------------- teste */

/** Envia UM template para o número informado, com dados fictícios. */
export async function sendTestDispatch(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const template = parseTemplate(String(formData.get("template") ?? ""));
  if (!template) return { error: "Escolha um template aprovado." };

  const params = parseParams(formData);
  if (!params) return { error: "Variável inválida." };

  const phone = normalizePhone(String(formData.get("telefone") ?? ""));
  if (!phone) return { error: "Telefone inválido. Use DDD + número." };

  const integration = await getMetaWaIntegration(ctx.area.id);
  if (!integration) return { error: "Conecte a API oficial em Integrações." };

  const values = resolveParams(params, {
    nome: "Fulano de Tal",
    email: "teste@exemplo.com",
    produto: "Produto de teste",
    valor: 97,
  });

  const result = await sendMetaTemplate(
    integration,
    phone,
    template.name,
    template.language,
    values,
  );

  await createAdminClient().from("wa_dispatch_log").insert({
    area_id: ctx.area.id,
    trigger: "manual",
    campaign_label: "teste",
    telefone: phone,
    template_name: template.name,
    template_language: template.language,
    params: values,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    wamid: result.ok ? result.wamid : null,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  await audit(ctx.area.id, ctx.user.email, "dispatch.test", { template: template.name });
  revalidatePath("/disparos");
  return result.ok ? { ok: `Teste enviado para ${phone}.` } : { error: result.error };
}

/* ----------------------------------------------------------- disparo manual */

type Target = {
  telefone: string;
  nome: string | null;
  email: string | null;
  produto: string | null;
};

/**
 * Monta o público já deduplicado e sem os números bloqueados. Públicos:
 *  - leads:  visitantes com telefone SEM compra aprovada;
 *  - buyers: compradores com compra aprovada;
 *  - paste:  lista colada (um número por linha).
 */
async function resolveAudience(
  areaId: string,
  formData: FormData,
): Promise<{ targets: Target[] } | { error: string }> {
  const admin = createAdminClient();
  const audience = String(formData.get("audience") ?? "");
  const targets = new Map<string, Target>();

  if (audience === "paste") {
    for (const line of String(formData.get("numbers") ?? "").split(/[\n,;]+/)) {
      const phone = normalizePhone(line);
      if (phone) targets.set(phone, { telefone: phone, nome: null, email: null, produto: null });
    }
  } else if (audience === "leads") {
    const { data: approved } = await admin
      .from("purchases")
      .select("email, telefone")
      .eq("area_id", areaId)
      .eq("status", "approved")
      .limit(20000);
    const boughtEmails = new Set(
      (approved ?? []).map((p) => (p.email as string | null)?.toLowerCase()),
    );
    const boughtPhones = new Set(
      (approved ?? []).map((p) => normalizePhone(p.telefone as string | null)),
    );

    const { data: visitors } = await admin
      .from("visitors")
      .select("nome, email, telefone")
      .eq("area_id", areaId)
      .not("telefone", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    for (const v of visitors ?? []) {
      const phone = normalizePhone(v.telefone as string | null);
      if (!phone || boughtPhones.has(phone)) continue;
      if (v.email && boughtEmails.has((v.email as string).toLowerCase())) continue;
      targets.set(phone, {
        telefone: phone,
        nome: v.nome as string | null,
        email: v.email as string | null,
        produto: null,
      });
    }
  } else if (audience === "buyers") {
    const { data: rows } = await admin
      .from("purchases")
      .select("email, telefone, produto")
      .eq("area_id", areaId)
      .eq("status", "approved")
      .not("telefone", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    for (const p of rows ?? []) {
      const phone = normalizePhone(p.telefone as string | null);
      if (!phone) continue;
      targets.set(phone, {
        telefone: phone,
        nome: null,
        email: p.email as string | null,
        produto: p.produto as string | null,
      });
    }
  } else {
    return { error: "Escolha o público." };
  }

  const { data: optouts } = await admin
    .from("wa_optouts")
    .select("telefone")
    .eq("area_id", areaId);
  for (const o of optouts ?? []) targets.delete(o.telefone as string);

  return { targets: [...targets.values()] };
}

/** Prévia: quantos contatos o público tem. Não enfileira nada. */
export async function countAudience(
  _prev: AudienceState,
  formData: FormData,
): Promise<AudienceState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const result = await resolveAudience(ctx.area.id, formData);
  if ("error" in result) return { error: result.error };
  return { total: result.targets.length };
}

/**
 * Enfileira a campanha. Exige `confirm_total` igual ao total real do público
 * (o usuário viu a prévia). Já processa o primeiro lote; o resto sai por
 * "Processar fila" ou pelo cron.
 */
export async function createManualCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const template = parseTemplate(String(formData.get("template") ?? ""));
  if (!template) return { error: "Escolha um template aprovado." };

  const params = parseParams(formData);
  if (!params) return { error: "Variável inválida." };

  const integration = await getMetaWaIntegration(ctx.area.id);
  if (!integration) return { error: "Conecte a API oficial em Integrações." };

  const audience = await resolveAudience(ctx.area.id, formData);
  if ("error" in audience) return { error: audience.error };

  const list = audience.targets;
  if (list.length === 0) return { error: "Nenhum contato válido nesse público." };
  if (list.length > MAX_CAMPAIGN) {
    return {
      error: `${list.length} contatos — o limite por campanha é ${MAX_CAMPAIGN}. Use "lista colada" para dividir.`,
    };
  }
  if (Number(formData.get("confirm_total")) !== list.length) {
    return { error: `O público mudou: agora são ${list.length} contatos. Veja a prévia de novo.` };
  }

  const label = String(formData.get("label") ?? "").trim().slice(0, 80) || "campanha";

  const { error } = await createAdminClient()
    .from("wa_dispatch_log")
    .insert(
      list.map((t) => ({
        area_id: ctx.area.id,
        trigger: "manual",
        campaign_label: label,
        telefone: t.telefone,
        template_name: template.name,
        template_language: template.language,
        params: resolveParams(params, t),
      })),
    );
  if (error) return { error: `Falha ao enfileirar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "dispatch.campaign", {
    label,
    audience: String(formData.get("audience") ?? ""),
    template: template.name,
    total: list.length,
  });

  const first = await processDispatchQueue({ areaId: ctx.area.id, limit: 50, maxMs: 40_000 });
  revalidatePath("/disparos");
  return {
    ok: `${list.length} na fila · primeiro lote: ${first.sent} enviados, ${first.failed} falhas, ${first.skipped} pulados.`,
  };
}

export async function processQueueNow(_prev?: FormState): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const summary = await processDispatchQueue({ areaId: ctx.area.id, limit: 100, maxMs: 45_000 });
  revalidatePath("/disparos");
  return {
    ok: `${summary.sent} enviados, ${summary.failed} falhas, ${summary.skipped} pulados.`,
  };
}

/* ---------------------------------------------------------------- bloqueio */

export async function addOptout(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const numbers = String(formData.get("numbers") ?? "")
    .split(/[\n,;]+/)
    .map((n) => normalizePhone(n))
    .filter((n): n is string => n !== null);
  if (numbers.length === 0) return { error: "Nenhum número válido." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("wa_optouts")
    .upsert(
      numbers.map((telefone) => ({ area_id: ctx.area.id, telefone })),
      { onConflict: "area_id,telefone" },
    );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  // Cancela o que já estava na fila para esses números.
  await admin
    .from("wa_dispatch_log")
    .update({ status: "skipped", error: "número na lista de bloqueio" })
    .eq("area_id", ctx.area.id)
    .eq("status", "queued")
    .in("telefone", numbers);

  revalidatePath("/disparos");
  return { ok: `${numbers.length} número(s) bloqueado(s).` };
}

export async function removeOptout(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await createAdminClient()
    .from("wa_optouts")
    .delete()
    .eq("area_id", ctx.area.id)
    .eq("telefone", String(formData.get("telefone") ?? ""));
  if (error) return { error: `Falha ao remover: ${error.message}` };

  revalidatePath("/disparos");
  return { ok: "Número liberado." };
}
