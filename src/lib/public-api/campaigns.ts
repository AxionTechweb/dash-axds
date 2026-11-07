import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { createEmitter } from "./events";

export type CampaignCounts = {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** Contagem das mensagens de uma campanha por status (campanhas têm no máximo 500). */
export async function campaignCounts(campaignId: string): Promise<CampaignCounts> {
  const counts: CampaignCounts = { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
  const { data } = await createAdminClient()
    .from("wa_dispatch_log")
    .select("status")
    .eq("campaign_id", campaignId)
    .limit(1000);
  for (const row of data ?? []) {
    const status = row.status as keyof CampaignCounts;
    if (status in counts) counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Forma pública de uma campanha (GET /campaigns, /campaigns/{id} e campaign.finished). */
export function campaignPayload(
  row: {
    id: string;
    label: string;
    template_name: string;
    template_language: string;
    total: number;
    scheduled_at: string;
    finished_at: string | null;
    canceled_at: string | null;
    created_at: string;
  },
  counts?: CampaignCounts,
): Record<string, unknown> {
  const status = row.canceled_at ? "canceled" : row.finished_at ? "finished" : "running";
  return {
    id: row.id,
    label: row.label,
    template: row.template_name,
    language: row.template_language,
    status,
    total: row.total,
    ...(counts ? { counts } : {}),
    scheduled_at: row.scheduled_at,
    finished_at: row.finished_at,
    canceled_at: row.canceled_at,
    created_at: row.created_at,
  };
}

export const CAMPAIGN_COLUMNS =
  "id, label, template_name, template_language, total, scheduled_at, finished_at, canceled_at, created_at";

/**
 * Marca como concluídas as campanhas que não têm mais nada na fila e emite
 * campaign.finished (uma única vez: o UPDATE só pega quem ainda não terminou).
 */
export async function finishCampaigns(campaignIds: Iterable<string>, emit: ReturnType<typeof createEmitter>) {
  const admin = createAdminClient();
  for (const id of new Set(campaignIds)) {
    try {
      const counts = await campaignCounts(id);
      if (counts.queued > 0 || counts.sending > 0) continue;
      const { data: done } = await admin
        .from("api_campaigns")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", id)
        .is("finished_at", null)
        .select(`area_id, ${CAMPAIGN_COLUMNS}`);
      const row = done?.[0];
      if (!row) continue;
      await emit(row.area_id as string, "campaign.finished", campaignPayload(row as never, counts));
    } catch (err) {
      console.error("[public-api] finishCampaigns:", err);
    }
  }
}
