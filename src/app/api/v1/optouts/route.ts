import { normalizePhone } from "@/lib/meta-wa/client";
import { apiError, apiOk, authenticate, readJson } from "@/lib/public-api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET  /api/v1/optouts — números bloqueados da área (não recebem nenhum disparo).
 * POST /api/v1/optouts — bloqueia um número ({ "number": "5511999999999" }).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;

  const { data } = await createAdminClient()
    .from("wa_optouts")
    .select("telefone, created_at")
    .eq("area_id", ctx.areaId)
    .order("created_at", { ascending: false })
    .limit(5000);
  return apiOk({ data: (data ?? []).map((o) => ({ number: o.telefone, created_at: o.created_at })) });
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const number = normalizePhone(typeof body.number === "string" || typeof body.number === "number" ? String(body.number) : "");
  if (!number) return apiError(422, "invalid_number", "`number` inválido. Use DDI + DDD + número, ex.: 5511999999999.");

  const { error } = await createAdminClient()
    .from("wa_optouts")
    .upsert({ area_id: ctx.areaId, telefone: number }, { onConflict: "area_id,telefone", ignoreDuplicates: true });
  if (error) return apiError(500, "internal_error", "Não consegui salvar o bloqueio. Tente de novo.");
  return apiOk({ number, opted_out: true }, 201);
}
