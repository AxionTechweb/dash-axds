import "server-only";

import {
  getLandingPageReport,
  getSessionSourceReport,
  getSourceMediumReport,
} from "@/lib/ga4/metrics";
import { getTodayYmdBRT } from "@/lib/period";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sincroniza os snapshots diários do GA4 (página de destino + origem da
 * sessão + origem/mídia da sessão) pra TODAS as áreas — chamado pelo cron
 * diário. Cada área isolada em try/catch: uma falha (ex.: credencial
 * inválida numa área) não derruba as demais.
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
    const errors: string[] = [];
    let rowsWritten = 0;

    try {
      const landingPages = await getLandingPageReport(areaId);
      errors.push(...landingPages.errors);

      if (landingPages.rows.length > 0) {
        const dbRows = landingPages.rows.map((row) => ({
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
        else rowsWritten += dbRows.length;
      }

      const sessionSources = await getSessionSourceReport(areaId);
      errors.push(...sessionSources.errors);

      if (sessionSources.rows.length > 0) {
        const dbRows = sessionSources.rows.map((row) => ({
          area_id: areaId,
          day: dayYmd,
          source: row.source,
          active_users: row.activeUsers,
          sessions: row.sessions,
          engaged_sessions: row.engagedSessions,
          avg_engagement_seconds: row.avgEngagementSeconds,
          engaged_sessions_per_user: row.engagedSessionsPerUser,
          events_per_session: row.eventsPerSession,
          engagement_rate: row.engagementRate,
          key_events: row.keyEvents,
          event_count: row.eventCount,
          total_revenue: row.totalRevenue,
        }));

        const { error } = await admin
          .from("ga4_session_sources")
          .upsert(dbRows, { onConflict: "area_id,day,source" });

        if (error) errors.push(`ga4_session_sources: ${error.message}`);
        else rowsWritten += dbRows.length;
      }

      const sourceMediums = await getSourceMediumReport(areaId);
      errors.push(...sourceMediums.errors);

      if (sourceMediums.rows.length > 0) {
        const dbRows = sourceMediums.rows.map((row) => ({
          area_id: areaId,
          day: dayYmd,
          source_medium: row.sourceMedium,
          sessions: row.sessions,
        }));

        const { error } = await admin
          .from("ga4_source_mediums")
          .upsert(dbRows, { onConflict: "area_id,day,source_medium" });

        if (error) errors.push(`ga4_source_mediums: ${error.message}`);
        else rowsWritten += dbRows.length;
      }

      summaries.push({ areaId, rowsWritten, errors });
    } catch (err) {
      summaries.push({
        areaId,
        rowsWritten,
        errors: [...errors, err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
