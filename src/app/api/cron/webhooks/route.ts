import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { deliverPending } from "@/lib/public-api/events";

/**
 * GET /api/cron/webhooks — entrega os webhooks da API pública que estão
 * pendentes ou na hora de reentregar. Chamado pelo pg_cron a cada minuto
 * (migration 20261107120000_public_api), com o mesmo Bearer dos outros crons.
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
    const summary = await deliverPending({ limit: 200, maxMs: 50_000 });
    return json({ ok: true, ...summary }, 200);
  } catch (err) {
    console.error("[cron/webhooks] falha na execução:", err);
    return json({ error: "execution_failed" }, 500);
  }
}
