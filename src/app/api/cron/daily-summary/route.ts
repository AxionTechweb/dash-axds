import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { sendDailySummary } from "@/lib/push-events";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/daily-summary — push das 18h (horário de Brasília) com o lucro
 * do dia e uma frase. Chamado pelo pg_cron do Supabase (job
 * panel-daily-summary, 21:00 UTC). Uma vez por dia por área (alert_state).
 *
 * Mesma proteção dos outros crons: Bearer $CRON_SECRET em tempo constante,
 * falha fechada sem o segredo no env.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);

  try {
    const { data: areas } = await createAdminClient().from("areas").select("id");
    const results = [];
    for (const area of areas ?? []) {
      results.push({ areaId: area.id, ...(await sendDailySummary(area.id as string)) });
    }
    return json({ ok: true, results }, 200);
  } catch (err) {
    console.error("[cron/daily-summary] falha:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
