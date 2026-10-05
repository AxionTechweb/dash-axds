import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { processDispatchQueue } from "@/lib/meta-wa/dispatch";

/**
 * GET /api/cron/dispatch — envia os disparos da API oficial da Meta que já
 * venceram (atraso configurado na regra: PIX pendente, abandono, lead…).
 *
 * No plano Hobby da Vercel o cron nativo é diário (ver vercel.json); para
 * atrasos de minutos, chame esta rota a cada 5 min com um cron externo
 * (Authorization: Bearer $CRON_SECRET). Disparos com atraso 0 não dependem
 * dele: saem logo após o evento.
 *
 * Mesma proteção dos outros crons: Bearer em tempo constante, falha fechada.
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
    const summary = await processDispatchQueue({ limit: 100, maxMs: 50_000 });
    return json({ ok: true, ...summary }, 200);
  } catch (err) {
    console.error("[cron/dispatch] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
