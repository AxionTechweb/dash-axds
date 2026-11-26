"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { normalizeEmail, processEmailQueue } from "@/lib/email/automation";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { renderEmail, safeUrl, SAMPLE_CONTEXT } from "@/lib/email/template";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string };

const TRIGGERS = ["approved"] as const;

async function requireArea() {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." as const };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." as const };
  return { user, area };
}

async function audit(areaId: string, actorEmail: string | undefined, action: string, details: Record<string, unknown>) {
  try {
    await createAdminClient().from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "email",
      details,
    });
  } catch {
    // auditoria não derruba a operação
  }
}

type ParsedTemplate = {
  subject: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  fromName: string | null;
  replyTo: string | null;
};

function parseTemplate(formData: FormData): ParsedTemplate | { error: string } {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const buttonLabel = String(formData.get("button_label") ?? "").trim();
  const buttonUrlRaw = String(formData.get("button_url") ?? "").trim();
  const fromName = String(formData.get("from_name") ?? "").trim();
  const replyToRaw = String(formData.get("reply_to") ?? "").trim();

  if (!subject || subject.length > 200) return { error: "Assunto obrigatório (até 200 caracteres)." };
  if (!body || body.length > 10_000) return { error: "Texto obrigatório (até 10 mil caracteres)." };
  if (buttonLabel.length > 60) return { error: "Texto do botão: até 60 caracteres." };
  if (fromName.length > 60) return { error: "Nome do remetente: até 60 caracteres." };

  let buttonUrl: string | null = null;
  if (buttonUrlRaw) {
    const probe = buttonUrlRaw.replace(/\{\{\s*[a-z_]+\s*\}\}/g, "x");
    if (!safeUrl(probe)) return { error: "Link do botão precisa começar com https://" };
    buttonUrl = buttonUrlRaw.slice(0, 500);
  }
  if (buttonLabel && !buttonUrl) return { error: "Informe o link do botão (ou apague o texto do botão)." };

  let replyTo: string | null = null;
  if (replyToRaw) {
    replyTo = normalizeEmail(replyToRaw);
    if (!replyTo) return { error: "E-mail de resposta inválido." };
  }

  return {
    subject,
    body,
    buttonLabel: buttonLabel || null,
    buttonUrl,
    fromName: fromName || null,
    replyTo,
  };
}

export async function saveEmailRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const trigger = String(formData.get("trigger") ?? "");
  if (!TRIGGERS.includes(trigger as (typeof TRIGGERS)[number])) return { error: "Gatilho inválido." };

  const parsed = parseTemplate(formData);
  if ("error" in parsed) return { error: parsed.error };

  const delay = Number(formData.get("delay_minutes") ?? 0);
  if (!Number.isInteger(delay) || delay < 0 || delay > 10080) {
    return { error: "Atraso deve estar entre 0 e 10080 minutos." };
  }
  const enabled = formData.get("enabled") === "on";

  const { error } = await createAdminClient()
    .from("email_rules")
    .upsert(
      {
        area_id: ctx.area.id,
        trigger,
        subject: parsed.subject,
        body: parsed.body,
        button_label: parsed.buttonLabel,
        button_url: parsed.buttonUrl,
        from_name: parsed.fromName,
        reply_to: parsed.replyTo,
        delay_minutes: delay,
        enabled,
      },
      { onConflict: "area_id,trigger" },
    );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "email.rule_save", { trigger, delay, enabled });
  revalidatePath("/emails");
  return { ok: enabled ? "E-mail salvo e LIGADO." : "E-mail salvo (desligado)." };
}

/** Envia o modelo do formulário (mesmo sem salvar) para um endereço, com dados fictícios. */
export async function sendTestEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };
  if (!emailConfigured()) return { error: "Resend não configurado no servidor (RESEND_API_KEY / EMAIL_FROM)." };

  const to = normalizeEmail(String(formData.get("test_to") ?? ""));
  if (!to) return { error: "Informe um e-mail válido para o teste." };

  const parsed = parseTemplate(formData);
  if ("error" in parsed) return { error: parsed.error };

  const rendered = renderEmail(parsed, SAMPLE_CONTEXT);
  const admin = createAdminClient();
  try {
    const providerId = await sendEmail({
      to,
      subject: `[TESTE] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      fromName: parsed.fromName,
      replyTo: parsed.replyTo,
    });
    await admin.from("email_log").insert({
      area_id: ctx.area.id,
      trigger: "test",
      email: to,
      subject: `[TESTE] ${rendered.subject}`,
      status: "sent",
      provider_id: providerId,
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro no envio";
    await admin.from("email_log").insert({
      area_id: ctx.area.id,
      trigger: "test",
      email: to,
      subject: `[TESTE] ${rendered.subject}`,
      status: "failed",
      error: message,
    });
    revalidatePath("/emails");
    return { error: `Falhou: ${message}` };
  }

  await audit(ctx.area.id, ctx.user.email, "email.test", { to });
  revalidatePath("/emails");
  return { ok: `Teste enviado para ${to}.` };
}

export async function processEmailQueueNow(_prev?: FormState): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };
  const s = await processEmailQueue({ areaId: ctx.area.id, limit: 50, maxMs: 25_000 });
  revalidatePath("/emails");
  return { ok: `Enviados ${s.sent}, falharam ${s.failed}, pulados ${s.skipped}.` };
}
