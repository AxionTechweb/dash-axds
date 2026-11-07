import { apiError, apiOk, authenticate } from "@/lib/public-api/auth";
import { messagePayload } from "@/lib/public-api/events";
import { UUID_RE } from "@/lib/public-api/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/messages/{id} — status de uma mensagem (id devolvido no envio ou no webhook). */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError(404, "not_found", "Mensagem não encontrada.");

  const { data: row } = await createAdminClient()
    .from("wa_dispatch_log")
    .select("id, telefone, template_name, template_language, trigger, source_ref, campaign_id, status, error, wamid, scheduled_at, sent_at, params")
    .eq("id", id)
    .eq("area_id", ctx.areaId)
    .maybeSingle();
  if (!row) return apiError(404, "not_found", "Mensagem não encontrada.");

  return apiOk({ ...messagePayload(row as never), params: row.params ?? [] });
}
