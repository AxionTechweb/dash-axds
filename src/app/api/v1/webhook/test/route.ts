import { apiOk, authenticate } from "@/lib/public-api/auth";
import { sendTestEvent } from "@/lib/public-api/events";

/** POST /api/v1/webhook/test — entrega agora um evento `webhook.test` e devolve o resultado. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const result = await sendTestEvent(ctx.areaId);
  return apiOk({ delivered: result.ok, http_status: result.status, error: result.error, delivery_id: result.delivery_id });
}
