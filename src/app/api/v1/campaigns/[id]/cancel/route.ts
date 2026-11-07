import { after } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/public-api/auth";
import { CAMPAIGN_COLUMNS, campaignCounts, campaignPayload } from "@/lib/public-api/campaigns";
import { createEmitter, deliverPending, messagePayload } from "@/lib/public-api/events";
import { UUID_RE } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/v1/campaigns/{id}/cancel — tira da fila o que ainda não saiu.
 * O que já foi enviado não volta; as mensagens canceladas viram "skipped".
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError(404, "not_found", "Campanha não encontrada.");

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("api_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("area_id", ctx.areaId)
    .maybeSingle();
  if (!campaign) return apiError(404, "not_found", "Campanha não encontrada.");
  if (campaign.finished_at || campaign.canceled_at) {
    return apiError(409, "campaign_closed", "A campanha já terminou ou já foi cancelada.");
  }

  const { data: canceled } = await admin
    .from("wa_dispatch_log")
    .update({ status: "skipped", error: "campanha cancelada pela API" })
    .eq("campaign_id", id)
    .eq("status", "queued")
    .select("id, telefone, template_name, template_language, trigger, source_ref, campaign_id, status, error, wamid, scheduled_at, sent_at");

  const now = new Date().toISOString();
  const { data: updated } = await admin
    .from("api_campaigns")
    .update({ canceled_at: now, finished_at: now })
    .eq("id", id)
    .select(CAMPAIGN_COLUMNS)
    .single();

  const emit = createEmitter();
  let queued = false;
  for (const row of canceled ?? []) {
    queued = (await emit(ctx.areaId, "message.skipped", messagePayload(row as never))) || queued;
  }
  if (queued) after(() => deliverPending({ areaId: ctx.areaId, limit: 100, maxMs: 30_000 }));

  return apiOk({
    ...campaignPayload((updated ?? campaign) as never, await campaignCounts(id)),
    canceled_messages: canceled?.length ?? 0,
  });
}
