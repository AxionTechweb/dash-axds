import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { emailConfigured, sendEmail } from "./send";
import { renderEmail, type EmailContext } from "./template";

/**
 * E-mails automáticos (Resend) disparados por evento de compra.
 *
 * - `enqueueEmail`: chamado pelo webhook. Só grava na fila (email_log),
 *   idempotente por regra + transação: webhook reenviado não manda 2x.
 * - `processEmailQueue`: envia o que já venceu. Chamado logo após o evento
 *   (atraso 0) e pelo cron de disparos (a cada 5 min).
 *
 * O texto é montado NA HORA do envio com a regra atual: editar a regra vale
 * também para o que ainda está na fila. Nada aqui lança.
 */

export type EmailTrigger = "approved" | "waiting_payment" | "abandoned";

const EMAIL_RE = /^[^\s@,()<>]+@[^\s@,()<>]+\.[^\s@,()<>]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase() ?? "";
  return EMAIL_RE.test(email) && email.length <= 200 ? email : null;
}

/** Status de compra em que o e-mail do gatilho ainda faz sentido. */
const STILL_VALID: Record<EmailTrigger, string[]> = {
  approved: ["approved"],
  waiting_payment: ["waiting_payment", "pending"],
  abandoned: ["abandoned", "canceled"],
};

export async function enqueueEmail(input: {
  areaId: string;
  trigger: string;
  sourceRef: string;
  email: string | null | undefined;
  context: EmailContext;
}): Promise<boolean> {
  try {
    if (!(input.trigger in STILL_VALID)) return false;
    const email = normalizeEmail(input.email);
    if (!email) return false;

    const admin = createAdminClient();
    const { data: rule } = await admin
      .from("email_rules")
      .select("id, delay_minutes")
      .eq("area_id", input.areaId)
      .eq("trigger", input.trigger)
      .eq("enabled", true)
      .maybeSingle();
    if (!rule) return false;

    const delay = rule.delay_minutes as number;
    const { error } = await admin.from("email_log").insert({
      area_id: input.areaId,
      rule_id: rule.id,
      trigger: input.trigger,
      source_ref: input.sourceRef,
      email,
      context: { ...input.context, email },
      scheduled_at: new Date(Date.now() + delay * 60_000).toISOString(),
    });
    // 23505 = já está na fila para esta regra + transação.
    if (error && error.code !== "23505") {
      console.error("[email] falha ao enfileirar:", error);
      return false;
    }
    return !error && delay === 0;
  } catch (err) {
    console.error("[email] enqueue:", err);
    return false;
  }
}

export type EmailSummary = { sent: number; failed: number; skipped: number };

type RuleRow = {
  id: string;
  subject: string;
  body: string;
  button_label: string | null;
  button_url: string | null;
  from_name: string | null;
  reply_to: string | null;
  enabled: boolean;
};

export async function processEmailQueue(options: {
  areaId?: string;
  limit?: number;
  maxMs?: number;
} = {}): Promise<EmailSummary> {
  const summary: EmailSummary = { sent: 0, failed: 0, skipped: 0 };
  const deadline = Date.now() + (options.maxMs ?? 40_000);

  try {
    const admin = createAdminClient();

    await admin
      .from("email_log")
      .update({ status: "failed", error: "Envio interrompido no meio — confira antes de reenviar." })
      .eq("status", "sending")
      .lt("claimed_at", new Date(Date.now() - 10 * 60_000).toISOString());

    let query = admin
      .from("email_log")
      .select("id, area_id, rule_id, trigger, source_ref, email, context")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(options.limit ?? 50);
    if (options.areaId) query = query.eq("area_id", options.areaId);
    const { data: rows } = await query;

    const rules = new Map<string, RuleRow | null>();

    for (const row of rows ?? []) {
      if (Date.now() > deadline) break;

      const { data: claimed } = await admin
        .from("email_log")
        .update({ status: "sending", claimed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const finish = async (
        status: "sent" | "failed" | "skipped",
        extra: { error?: string; providerId?: string | null; subject?: string },
      ) => {
        await admin
          .from("email_log")
          .update({
            status,
            error: extra.error ?? null,
            provider_id: extra.providerId ?? null,
            subject: extra.subject ?? null,
            sent_at: status === "sent" ? new Date().toISOString() : null,
          })
          .eq("id", row.id);
        summary[status] += 1;
      };

      const ruleId = row.rule_id as string | null;
      if (!ruleId) {
        await finish("skipped", { error: "Regra removida." });
        continue;
      }
      if (!rules.has(ruleId)) {
        const { data } = await admin
          .from("email_rules")
          .select("id, subject, body, button_label, button_url, from_name, reply_to, enabled")
          .eq("id", ruleId)
          .maybeSingle();
        rules.set(ruleId, (data as RuleRow | null) ?? null);
      }
      const rule = rules.get(ruleId);
      if (!rule || !rule.enabled) {
        await finish("skipped", { error: "Regra desligada." });
        continue;
      }

      const trigger = row.trigger as EmailTrigger;
      if (row.source_ref && trigger in STILL_VALID) {
        const { data: purchase } = await admin
          .from("purchases")
          .select("status")
          .eq("area_id", row.area_id)
          .eq("transaction_id", row.source_ref)
          .maybeSingle();
        if (purchase && !STILL_VALID[trigger].includes(purchase.status as string)) {
          await finish("skipped", { error: `compra mudou para "${purchase.status}"` });
          continue;
        }
      }

      if (!emailConfigured()) {
        await finish("failed", { error: "Resend não configurado (RESEND_API_KEY / EMAIL_FROM)." });
        continue;
      }

      const rendered = renderEmail(
        {
          subject: rule.subject,
          body: rule.body,
          buttonLabel: rule.button_label,
          buttonUrl: rule.button_url,
        },
        (row.context as EmailContext) ?? {},
      );
      try {
        const providerId = await sendEmail({
          to: row.email as string,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          fromName: rule.from_name,
          replyTo: rule.reply_to,
        });
        await finish("sent", { providerId, subject: rendered.subject });
      } catch (err) {
        await finish("failed", {
          error: err instanceof Error ? err.message.slice(0, 300) : "erro no envio",
          subject: rendered.subject,
        });
      }
    }
  } catch (err) {
    console.error("[email] processEmailQueue:", err);
  }

  return summary;
}
