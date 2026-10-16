import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runHandoffWatchdogForAllAreas } from "@/lib/support/handoff-watchdog";

/**
 * GET /api/cron/support-handoff — devolve pra IA conversas do agente de
 * suporte do WhatsApp que ficaram escalonadas pra humano (mode = "human")
 * sem ninguém responder por mais de 4h.
 *
 * Disparado por um agendador EXTERNO a cada ~15-30min — não pela Vercel Cron
 * nativa (plano Hobby só roda 1x/dia), mesmo esquema de /api/cron/alerts e
 * /api/cron/daily-campaigns.
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
    const results = await runHandoffWatchdogForAllAreas();
    return json(
      {
        ok: true,
        areas: results.length,
        checked: results.reduce((s, r) => s + r.checked, 0),
        resumed: results.reduce((s, r) => s + r.resumed, 0),
        errors: results.flatMap((r) => r.errors),
      },
      200,
    );
  } catch (err) {
    console.error("[cron/support-handoff] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
