import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runGa4SyncForAllAreas } from "@/lib/reports/ga4";

/**
 * GET /api/cron/ga4 — snapshot diário de "página de destino" do GA4 pra
 * todas as áreas. Cron nativo da Vercel (1x/dia — plano Hobby permite,
 * diferente do checkpoint intradia que precisa de agendador externo).
 *
 * Mesma proteção de /api/cron/rules: Authorization: Bearer $CRON_SECRET,
 * em tempo constante, falha fechada sem o segredo no env.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const summaries = await runGa4SyncForAllAreas();
    return json(
      {
        ok: true,
        areas: summaries.length,
        rowsWritten: summaries.reduce((sum, s) => sum + s.rowsWritten, 0),
        summaries,
      },
      200,
    );
  } catch (err) {
    console.error("[cron/ga4] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
