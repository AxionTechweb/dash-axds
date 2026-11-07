import { apiError, apiOk, authenticate } from "@/lib/public-api/auth";
import { CAMPAIGN_COLUMNS, campaignCounts, campaignPayload } from "@/lib/public-api/campaigns";
import { messagePayload } from "@/lib/public-api/events";
import { UUID_RE } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/campaigns/{id}?include=messages — progresso (e mensagens) da campanha. */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const result: Record<string, unknown> = campaignPayload(campaign as never, await campaignCounts(id));

  if (new URL(request.url).searchParams.get("include") === "messages") {
    const { data: rows } = await admin
      .from("wa_dispatch_log")
      .select("id, telefone, template_name, template_language, trigger, source_ref, campaign_id, status, error, wamid, scheduled_at, sent_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true })
      .limit(1000);
    result.messages = (rows ?? []).map((row) => messagePayload(row as never));
  }

  return apiOk(result);
}
