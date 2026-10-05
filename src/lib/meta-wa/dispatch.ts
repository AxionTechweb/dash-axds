import "server-only";

import { formatCurrency } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

import { getMetaWaIntegration, normalizePhone, sendMetaTemplate, type MetaWaIntegration } from "./client";
import type { DispatchTrigger } from "./constants";

/**
 * Fila de disparo (wa_dispatch_log) sobre a Cloud API da Meta.
 *
 * - `enqueue*`  : chamado pelos webhooks/captura. Só grava a linha na fila
 *                 (idempotente por regra+origem); NUNCA envia na hora.
 * - `processDispatchQueue`: pega o que já venceu (scheduled_at) e envia.
 *                 Chamado pelo cron e, quando o atraso é 0, logo após o evento.
 *
 * Nada aqui lança: falha de disparo jamais pode derrubar o webhook de compra.
 */

export type DispatchContext = {
  nome?: string | null;
  email?: string | null;
  produto?: string | null;
  valor?: number | null;
  moeda?: string | null;
};

/** Variáveis do corpo na ordem escolhida na regra. Meta rejeita valor vazio. */
export function resolveParams(keys: string[], ctx: DispatchContext): string[] {
  const nome = ctx.nome?.trim() || "";
  return keys.map((key) => {
    switch (key) {
      case "primeiro_nome":
        return nome.split(/\s+/)[0] || "cliente";
      case "nome":
        return nome || "cliente";
      case "produto":
        return ctx.produto?.trim() || "seu pedido";
      case "valor":
        return typeof ctx.valor === "number"
          ? formatCurrency(ctx.valor, ctx.moeda || "BRL")
          : "-";
      case "email":
        return ctx.email?.trim() || "-";
      default:
        return "-";
    }
  });
}

type EnqueueInput = {
  areaId: string;
  trigger: DispatchTrigger;
  /** transaction_id da compra ou user_id do visitante — chave de idempotência. */
  sourceRef: string;
  telefone: string | null | undefined;
  context: DispatchContext;
};

/** Devolve true se algo entrou na fila com atraso 0 (vale processar já). */
export async function enqueueDispatch(input: EnqueueInput): Promise<boolean> {
  try {
    const phone = normalizePhone(input.telefone);
    if (!phone) return false;

    const admin = createAdminClient();
    const { data: rule } = await admin
      .from("wa_dispatch_rules")
      .select("id, template_name, template_language, body_params, delay_minutes")
      .eq("area_id", input.areaId)
      .eq("trigger", input.trigger)
      .eq("enabled", true)
      .maybeSingle();
    if (!rule) return false;

    const delay = rule.delay_minutes as number;
    const { error } = await admin.from("wa_dispatch_log").insert({
      area_id: input.areaId,
      rule_id: rule.id,
      trigger: input.trigger,
      source_ref: input.sourceRef,
      telefone: phone,
      template_name: rule.template_name,
      template_language: rule.template_language,
      params: resolveParams((rule.body_params as string[]) ?? [], input.context),
      scheduled_at: new Date(Date.now() + delay * 60_000).toISOString(),
    });

    // 23505 = já enfileirado para esta regra+origem (webhook reenviado): ok.
    if (error && error.code !== "23505") {
      console.error("[meta-wa] falha ao enfileirar:", error);
      return false;
    }
    return !error && delay === 0;
  } catch (err) {
    console.error("[meta-wa] enqueue:", err);
    return false;
  }
}

const PURCHASE_TRIGGER_STATUSES: Record<string, string[]> = {
  waiting_payment: ["waiting_payment", "pending"],
  abandoned: ["abandoned", "canceled"],
};

/** Motivo para NÃO enviar mais (a venda mudou, optout, já enviado…) ou null. */
async function skipReason(row: {
  id: string;
  area_id: string;
  trigger: string;
  source_ref: string | null;
  telefone: string;
  template_name: string;
  created_at: string;
}): Promise<string | null> {
  const admin = createAdminClient();

  const { data: optout } = await admin
    .from("wa_optouts")
    .select("telefone")
    .eq("area_id", row.area_id)
    .eq("telefone", row.telefone)
    .maybeSingle();
  if (optout) return "número na lista de bloqueio";

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: recent } = await admin
    .from("wa_dispatch_log")
    .select("id")
    .eq("area_id", row.area_id)
    .eq("telefone", row.telefone)
    .eq("template_name", row.template_name)
    .eq("status", "sent")
    .gte("sent_at", since)
    .limit(1);
  if (recent && recent.length > 0) return "mesmo template já enviado a este número nas últimas 24h";

  if (row.trigger in PURCHASE_TRIGGER_STATUSES && row.source_ref) {
    const { data: purchase } = await admin
      .from("purchases")
      .select("status, email, produto")
      .eq("area_id", row.area_id)
      .eq("transaction_id", row.source_ref)
      .maybeSingle();

    if (purchase && !PURCHASE_TRIGGER_STATUSES[row.trigger].includes(purchase.status as string)) {
      return `compra mudou para "${purchase.status}"`;
    }

    if (purchase?.email) {
      let query = admin
        .from("purchases")
        .select("id")
        .eq("area_id", row.area_id)
        .eq("status", "approved")
        .eq("email", purchase.email as string)
        .gte("created_at", row.created_at)
        .limit(1);
      if (purchase.produto) query = query.eq("produto", purchase.produto as string);
      const { data: bought } = await query;
      if (bought && bought.length > 0) return "a pessoa já comprou";
    }
  }

  if (row.trigger === "lead" && row.source_ref) {
    const { data: visitor } = await admin
      .from("visitors")
      .select("email")
      .eq("area_id", row.area_id)
      .eq("user_id", row.source_ref)
      .maybeSingle();

    let query = admin
      .from("purchases")
      .select("id")
      .eq("area_id", row.area_id)
      .eq("status", "approved")
      .limit(1);
    query = visitor?.email
      ? query.or(`user_id.eq.${row.source_ref},email.eq.${visitor.email}`)
      : query.eq("user_id", row.source_ref);
    const { data: bought } = await query;
    if (bought && bought.length > 0) return "a pessoa já comprou";
  }

  return null;
}

export type ProcessSummary = { sent: number; failed: number; skipped: number };

/** Envia o que já venceu. `areaId` limita a uma área (senão, todas). */
export async function processDispatchQueue(options: {
  areaId?: string;
  limit?: number;
  maxMs?: number;
} = {}): Promise<ProcessSummary> {
  const summary: ProcessSummary = { sent: 0, failed: 0, skipped: 0 };
  const deadline = Date.now() + (options.maxMs ?? 45_000);

  try {
    const admin = createAdminClient();
    let query = admin
      .from("wa_dispatch_log")
      .select("id, area_id, trigger, source_ref, telefone, template_name, template_language, params, created_at")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(options.limit ?? 50);
    if (options.areaId) query = query.eq("area_id", options.areaId);

    const { data: rows } = await query;
    const integrations = new Map<string, MetaWaIntegration | null>();

    for (const row of rows ?? []) {
      if (Date.now() > deadline) break;

      // Claim atômico: cron e `after` concorrentes nunca enviam a mesma linha 2x.
      const { data: claimed } = await admin
        .from("wa_dispatch_log")
        .update({ status: "sending" })
        .eq("id", row.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const finish = async (
        status: "sent" | "failed" | "skipped",
        extra: { error?: string; wamid?: string | null },
      ) => {
        await admin
          .from("wa_dispatch_log")
          .update({
            status,
            error: extra.error ?? null,
            wamid: extra.wamid ?? null,
            sent_at: status === "sent" ? new Date().toISOString() : null,
          })
          .eq("id", row.id);
        summary[status] += 1;
      };

      const reason = await skipReason(row);
      if (reason) {
        await finish("skipped", { error: reason });
        continue;
      }

      if (!integrations.has(row.area_id)) {
        integrations.set(row.area_id, await getMetaWaIntegration(row.area_id));
      }
      const integration = integrations.get(row.area_id);
      if (!integration) {
        await finish("failed", { error: "Integração da API oficial desligada ou ausente." });
        continue;
      }

      const result = await sendMetaTemplate(
        integration,
        row.telefone,
        row.template_name,
        row.template_language,
        (row.params as string[]) ?? [],
      );
      if (result.ok) await finish("sent", { wamid: result.wamid });
      else await finish("failed", { error: result.error });
    }
  } catch (err) {
    console.error("[meta-wa] processDispatchQueue:", err);
  }

  return summary;
}
