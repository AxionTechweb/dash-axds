import { apiOk, authenticate } from "@/lib/public-api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/webhook/deliveries?status=pending|delivered|failed — últimas entregas (até 100). */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;

  const status = new URL(request.url).searchParams.get("status");
  let query = createAdminClient()
    .from("api_webhook_deliveries")
    .select("id, event, status, attempts, last_status, last_error, next_attempt_at, delivered_at, created_at")
    .eq("area_id", ctx.areaId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "pending" || status === "delivered" || status === "failed") query = query.eq("status", status);

  const { data } = await query;
  return apiOk({
    data: (data ?? []).map((d) => ({
      id: d.id,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      last_http_status: d.last_status,
      last_error: d.last_error,
      next_attempt_at: d.status === "pending" ? d.next_attempt_at : null,
      delivered_at: d.delivered_at,
      created_at: d.created_at,
    })),
  });
}
