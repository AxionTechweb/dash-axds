import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { runAllRules } from "@/lib/rules/engine";

/**
 * GET /api/cron/rules — execução agendada das Regras (Vercel Cron).
 *
 * Protegido pelo CRON_SECRET: a Vercel envia `Authorization: Bearer <secret>`.
 * Sem o segredo configurado, a rota fica DESATIVADA (falha fechada).
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
    const summaries = await runAllRules();
    return json(
      {
        ok: true,
        rules: summaries.length,
        matched: summaries.reduce((sum, s) => sum + s.matched, 0),
        actedOn: summaries.reduce((sum, s) => sum + s.actedOn, 0),
        summaries,
      },
      200,
    );
  } catch (err) {
    console.error("[cron/rules] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
