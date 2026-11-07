import { after } from "next/server";

import { normalizePhone, sendMetaTemplate } from "@/lib/meta-wa/client";
import { apiError, apiOk, authenticate, readJson } from "@/lib/public-api/auth";
import { createEmitter, deliverPending, messagePayload } from "@/lib/public-api/events";
import { parseParams, parseTemplateRef, requireIntegration } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/v1/send/template — envia UM template agora (síncrono).
 * Respeita a lista de bloqueio da área; o resultado fica no log de disparos
 * e vira evento message.sent / message.failed no webhook.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const number = normalizePhone(typeof body.number === "string" || typeof body.number === "number" ? String(body.number) : "");
  if (!number) return apiError(422, "invalid_number", "`number` inválido. Use DDI + DDD + número, ex.: 5511999999999.");
  const template = parseTemplateRef(body);
  if (template instanceof Response) return template;
  const params = parseParams(body.params);
  if (params instanceof Response) return params;

  const integration = await requireIntegration(ctx.areaId);
  if (integration instanceof Response) return integration;

  const admin = createAdminClient();
  const { data: optout } = await admin
    .from("wa_optouts")
    .select("telefone")
    .eq("area_id", ctx.areaId)
    .eq("telefone", number)
    .maybeSingle();
  if (optout) return apiError(409, "number_opted_out", "Este número está na lista de bloqueio da área.");

  const result = await sendMetaTemplate(integration, number, template.name, template.language, params);
  const sentAt = result.ok ? new Date().toISOString() : null;

  const { data: row } = await admin
    .from("wa_dispatch_log")
    .insert({
      area_id: ctx.areaId,
      trigger: "manual",
      campaign_label: "api",
      source_ref: "api",
      telefone: number,
      template_name: template.name,
      template_language: template.language,
      params,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
      wamid: result.ok ? result.wamid : null,
      sent_at: sentAt,
    })
    .select("id, area_id, telefone, template_name, template_language, trigger, source_ref, campaign_id, status, error, wamid, scheduled_at, sent_at")
    .single();

  const message = row
    ? messagePayload(row as never)
    : messagePayload({
        id: "",
        telefone: number,
        template_name: template.name,
        template_language: template.language,
        trigger: "manual",
        source_ref: "api",
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        wamid: result.ok ? result.wamid : null,
        sent_at: sentAt,
      });

  if (row) {
    const emit = createEmitter();
    if (await emit(ctx.areaId, result.ok ? "message.sent" : "message.failed", message)) {
      after(() => deliverPending({ areaId: ctx.areaId, limit: 20, maxMs: 20_000 }));
    }
  }

  if (!result.ok) {
    return Response.json({ error: { code: "meta_rejected", message: `A Meta recusou: ${result.error}` }, message }, { status: 422 });
  }
  return apiOk(message);
}
