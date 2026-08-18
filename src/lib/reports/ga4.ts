import "server-only";

import { getLandingPageReport } from "@/lib/ga4/metrics";
import { getTodayYmdBRT } from "@/lib/period";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sincroniza o snapshot diário de "página de destino" do GA4 pra TODAS as
 * áreas — chamado pelo cron diário. Cada área isolada em try/catch: uma
 * falha (ex.: credencial inválida numa área) não derruba as demais.
 */

export type Ga4AreaSummary = {
  areaId: string;
  rowsWritten: number;
  errors: string[];
};

export async function runGa4SyncForAllAreas(): Promise<Ga4AreaSummary[]> {
  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return [];

  const dayYmd = getTodayYmdBRT();
  const summaries: Ga4AreaSummary[] = [];

  for (const area of areas) {
    const areaId = area.id as string;

    try {
      const { rows, errors } = await getLandingPageReport(areaId);

      if (rows.length === 0) {
        summaries.push({ areaId, rowsWritten: 0, errors });
        continue;
      }

      const dbRows = rows.map((row) => ({
        area_id: areaId,
        day: dayYmd,
        landing_page: row.landingPage,
        sessions: row.sessions,
        active_users: row.activeUsers,
        new_users: row.newUsers,
        avg_engagement_seconds: row.avgEngagementSeconds,
        key_events: row.keyEvents,
        total_revenue: row.totalRevenue,
        key_event_rate: row.keyEventRate,
      }));

      const { error } = await admin
        .from("ga4_landing_pages")
        .upsert(dbRows, { onConflict: "area_id,day,landing_page" });

      if (error) errors.push(`ga4_landing_pages: ${error.message}`);

      summaries.push({ areaId, rowsWritten: error ? 0 : dbRows.length, errors });
    } catch (err) {
      summaries.push({
        areaId,
        rowsWritten: 0,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
