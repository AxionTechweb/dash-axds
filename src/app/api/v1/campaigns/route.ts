import { after } from "next/server";

import { normalizePhone } from "@/lib/meta-wa/client";
import { processDispatchQueue } from "@/lib/meta-wa/dispatch";
import { apiError, apiOk, authenticate, readJson } from "@/lib/public-api/auth";
import { CAMPAIGN_COLUMNS, campaignPayload } from "@/lib/public-api/campaigns";
import { deliverPending } from "@/lib/public-api/events";
import { MAX_CAMPAIGN, parseParams, parseSchedule, parseTemplateRef, requireIntegration } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET  /api/v1/campaigns — campanhas criadas pela API (mais recentes primeiro).
 * POST /api/v1/campaigns — disparo em lote: um template, variáveis por
 *      destinatário. Entra na fila de disparos (a mesma do painel) e sai aos
 *      poucos; o progresso fica em GET /campaigns/{id} e no webhook.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;

  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 20, 1), 100);
  const { data } = await createAdminClient()
    .from("api_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("area_id", ctx.areaId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return apiOk({ data: (data ?? []).map((row) => campaignPayload(row as never)) });
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const template = parseTemplateRef(body);
  if (template instanceof Response) return template;
  const defaultParams = parseParams(body.params);
  if (defaultParams instanceof Response) return defaultParams;
  const scheduledAt = parseSchedule(body.scheduled_for);
  if (scheduledAt instanceof Response) return scheduledAt;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return apiError(422, "invalid_messages", "`messages` precisa ser um array com pelo menos 1 destinatário: [{ \"number\": \"5511999999999\", \"params\": [\"Maria\"] }].");
  }
  if (body.messages.length > MAX_CAMPAIGN) {
    return apiError(422, "too_many_messages", `No máximo ${MAX_CAMPAIGN} destinatários por campanha. Divida em mais campanhas.`);
  }

  // Normaliza, tira duplicados e guarda os inválidos para devolver.
  const targets = new Map<string, string[]>();
  const invalid: string[] = [];
  let duplicates = 0;
  for (const [index, item] of body.messages.entries()) {
    const entry = (typeof item === "object" && item !== null ? item : { number: item }) as Record<string, unknown>;
    const raw = typeof entry.number === "string" || typeof entry.number === "number" ? String(entry.number) : "";
    const number = normalizePhone(raw);
    if (!number) {
      invalid.push(raw || `#${index}`);
      continue;
    }
    if (targets.has(number)) {
      duplicates += 1;
      continue;
    }
    const params = entry.params === undefined ? defaultParams : parseParams(entry.params, `messages[${index}].params`);
    if (params instanceof Response) return params;
    targets.set(number, params);
  }

  const admin = createAdminClient();
  const { data: optouts } = await admin.from("wa_optouts").select("telefone").eq("area_id", ctx.areaId);
  let optedOut = 0;
  for (const o of optouts ?? []) if (targets.delete(o.telefone as string)) optedOut += 1;

  if (targets.size === 0) {
    return apiError(422, "no_valid_recipients", "Nenhum destinatário válido (números inválidos, repetidos ou na lista de bloqueio).");
  }

  const integration = await requireIntegration(ctx.areaId);
  if (integration instanceof Response) return integration;

  const label = (typeof body.label === "string" ? body.label.trim().slice(0, 80) : "") || "campanha via API";
  const { data: campaign, error: campaignError } = await admin
    .from("api_campaigns")
    .insert({
      area_id: ctx.areaId,
      label,
      template_name: template.name,
      template_language: template.language,
      total: targets.size,
      scheduled_at: scheduledAt,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (campaignError || !campaign) return apiError(500, "internal_error", "Não consegui criar a campanha. Tente de novo.");

  const { error } = await admin.from("wa_dispatch_log").insert(
    [...targets.entries()].map(([telefone, params]) => ({
      area_id: ctx.areaId,
      trigger: "manual",
      campaign_label: label,
      campaign_id: campaign.id,
      source_ref: "api",
      telefone,
      template_name: template.name,
      template_language: template.language,
      params,
      scheduled_at: scheduledAt,
    })),
  );
  if (error) {
    await admin.from("api_campaigns").delete().eq("id", campaign.id);
    return apiError(500, "internal_error", "Não consegui enfileirar as mensagens. Tente de novo.");
  }

  // Campanha para agora: começa a enviar logo depois de responder.
  if (Date.parse(scheduledAt) <= Date.now() + 1000) {
    after(async () => {
      await processDispatchQueue({ areaId: ctx.areaId, limit: 50, maxMs: 40_000 });
      await deliverPending({ areaId: ctx.areaId, limit: 100, maxMs: 15_000 });
    });
  }

  return apiOk(
    {
      ...campaignPayload(campaign as never),
      rejected: { invalid_numbers: invalid.slice(0, 50), invalid: invalid.length, duplicates, opted_out: optedOut },
    },
    202,
  );
}
