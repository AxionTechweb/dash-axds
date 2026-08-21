import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runAlertsForAllAreas } from "@/lib/alerts";

/**
 * GET /api/cron/alerts — avisos de WhatsApp (sem venda há 1h, conta de
 * anúncio desativada na Meta).
 *
 * Disparado por um agendador EXTERNO a cada ~15min — não pela Vercel Cron
 * nativa (plano Hobby só roda 1x/dia), mesmo esquema de
 * /api/cron/daily-campaigns. Cada checagem já se protege contra spam
 * internamente (alert_state / last_known_status) — pode rodar com
 * frequência sem se preocupar em repetir aviso.
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
    const results = await runAlertsForAllAreas();
    return json(
      {
        ok: true,
        areas: results.length,
        errors: results.flatMap((r) => r.errors),
      },
      200,
    );
  } catch (err) {
    console.error("[cron/alerts] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
