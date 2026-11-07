import { apiOk, authenticate, RATE_LIMIT_PER_MINUTE } from "@/lib/public-api/auth";
import { MAX_CAMPAIGN } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/account — área, número conectado e limites. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;

  const admin = createAdminClient();
  const [{ data: area }, { data: wa }] = await Promise.all([
    admin.from("areas").select("id, nome").eq("id", ctx.areaId).maybeSingle(),
    admin
      .from("meta_wa_integrations")
      .select("waba_id, phone_number_id, display_phone, enabled")
      .eq("area_id", ctx.areaId)
      .maybeSingle(),
  ]);

  return apiOk({
    area: { id: ctx.areaId, name: (area?.nome as string) ?? null },
    whatsapp: {
      connected: Boolean(wa && wa.enabled !== false),
      display_phone: (wa?.display_phone as string) ?? null,
      waba_id: (wa?.waba_id as string) ?? null,
      phone_number_id: (wa?.phone_number_id as string) ?? null,
    },
    limits: { requests_per_minute: RATE_LIMIT_PER_MINUTE, campaign_max_messages: MAX_CAMPAIGN },
  });
}
