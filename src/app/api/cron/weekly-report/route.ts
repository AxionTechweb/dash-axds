import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runWeeklyReportForAllAreas } from "@/lib/reports/weekly";

/**
 * GET /api/cron/weekly-report — relatório semanal por criativo (Meta + Vturb
 * + checkout), agendado para segunda-feira de manhã (Vercel Cron).
 *
 * Calcula a semana Seg–Dom que acabou de fechar, grava em `creative_reports`
 * e escreve a cópia de leitura no Google Sheets configurado por área. Mesma
 * proteção de /api/cron/rules: Authorization: Bearer $CRON_SECRET, em tempo
 * constante, falha fechada sem o segredo no env.
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
    const summaries = await runWeeklyReportForAllAreas();
    return json(
      {
        ok: true,
        areas: summaries.length,
        rowsWritten: summaries.reduce((sum, s) => sum + s.rowsWritten, 0),
        sheetsOk: summaries.filter((s) => s.sheetOk).length,
        summaries,
      },
      200,
    );
  } catch (err) {
    console.error("[cron/weekly-report] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
