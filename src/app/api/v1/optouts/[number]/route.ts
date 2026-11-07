import { normalizePhone } from "@/lib/meta-wa/client";
import { apiError, apiOk, authenticate } from "@/lib/public-api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** DELETE /api/v1/optouts/{number} — tira o número da lista de bloqueio. */
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const number = normalizePhone(decodeURIComponent((await params).number));
  if (!number) return apiError(422, "invalid_number", "Número inválido. Use DDI + DDD + número, ex.: 5511999999999.");

  const { data } = await createAdminClient()
    .from("wa_optouts")
    .delete()
    .eq("area_id", ctx.areaId)
    .eq("telefone", number)
    .select("telefone");
  if (!data || data.length === 0) return apiError(404, "not_found", "Este número não está na lista de bloqueio.");
  return apiOk({ number, opted_out: false });
}
