import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runDailyCheckpointForAllAreas } from "@/lib/reports/daily";

/**
 * GET /api/cron/daily-campaigns — checkpoint intradia por campanha ATIVA
 * (Meta + vendas do checkout), escrito na 2ª planilha (independente do
 * relatório semanal).
 *
 * Disparado por um agendador EXTERNO de hora em hora — não pela Vercel Cron
 * nativa (plano Hobby só roda 1x/dia). A rota decide sozinha se "agora" é
 * um dos 10 horários de checkpoint (`CHECKPOINT_HOURS` em
 * src/lib/reports/daily.ts); fora disso, no-op — é o que permite o
 * agendador externo ser só "1 job de hora em hora", sem precisar saber
 * quais horários importam.
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
    const result = await runDailyCheckpointForAllAreas();

    if (result.skipped) {
      return json({ ok: true, skipped: true, hour: result.hour }, 200);
    }

    return json(
      {
        ok: true,
        skipped: false,
        day: result.day,
        hour: result.hour,
        areas: result.areas.length,
        campaigns: result.areas.reduce((sum, a) => sum + a.campaigns, 0),
        sheetOk: result.areas.reduce((sum, a) => sum + a.sheetOk, 0),
        summaries: result.areas,
      },
      200,
    );
  } catch (err) {
    console.error("[cron/daily-campaigns] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
