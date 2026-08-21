import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runUmblerSyncForAllAreas } from "@/lib/reports/umbler";

/**
 * GET /api/cron/umbler — sync diário da contagem de templates de WhatsApp
 * enviados (Umbler Talk), dia anterior BRT, por template.
 *
 * Cron NATIVO da Vercel (1x/dia cabe no plano Hobby, ao contrário dos outros
 * crons de captura intradia) — ver vercel.json.
 *
 * Mesma proteção dos outros crons: Authorization: Bearer $CRON_SECRET, em
 * tempo constante, falha fechada sem o segredo no env.
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
    const summaries = await runUmblerSyncForAllAreas();
    return json(
      {
        ok: true,
        areas: summaries.length,
        partial: summaries.some((s) => s.partial),
        chatsScanned: summaries.reduce((sum, s) => sum + s.chatsScanned, 0),
        templatesFound: summaries.reduce((sum, s) => sum + s.templatesFound, 0),
        errors: summaries.flatMap((s) => s.errors),
        summaries,
      },
      200,
    );
  } catch (err) {
    console.error("[cron/umbler] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
