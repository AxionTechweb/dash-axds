import { after } from "next/server";
import { z } from "zod";

import {
  guardCapture,
  handlePreflight,
  json,
  norm,
  tokenFrom,
} from "@/lib/capture";
import { isValidVisitorId, newVisitorId } from "@/lib/ids";
import { enqueueDispatch, processDispatchQueue } from "@/lib/meta-wa/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/identify — UPSERT do visitante.
 *
 * Público (chamado pelo snippet em outros domínios). Apenas GRAVA no banco:
 * nada é enviado para Meta, GA4 ou qualquer plataforma externa.
 *
 * O IP real, o user-agent e o GEO são derivados no SERVIDOR (headers), nunca
 * confiando no que o cliente mandar.
 */

export const dynamic = "force-dynamic";

const IdentifySchema = z.object({
  a: z.string().max(128).optional(),
  userId: z.string().max(64).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  telefone: z.string().max(32).optional().nullable(),
  nome: z.string().max(120).optional().nullable(),
  utm_source: z.string().max(255).optional().nullable(),
  utm_medium: z.string().max(255).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(),
  utm_term: z.string().max(255).optional().nullable(),
  utm_content: z.string().max(255).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
});

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = IdentifySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_payload" }, 400);
  }
  const body = parsed.data;

  const token = tokenFrom(request, body);
  const guard = await guardCapture(request, token, "identify", 120, 60);
  if (!guard.ok) return guard.response;

  const { area, ctx, headers } = guard;

  // Aceita o id vindo do cliente só se tiver o formato esperado; senão gera.
  const incoming = norm(body.userId);
  const userId =
    incoming && isValidVisitorId(incoming) ? incoming : newVisitorId();

  const admin = createAdminClient();
  const { error } = await admin.rpc("identify_visitor", {
    p_area_id: area.id,
    p_user_id: userId,
    p_email: norm(body.email),
    p_telefone: norm(body.telefone),
    p_nome: norm(body.nome),
    p_utm_source: norm(body.utm_source),
    p_utm_medium: norm(body.utm_medium),
    p_utm_campaign: norm(body.utm_campaign),
    p_utm_term: norm(body.utm_term),
    p_utm_content: norm(body.utm_content),
    p_referrer: norm(body.referrer),
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
    p_geo_country: ctx.geoCountry,
    p_geo_region: ctx.geoRegion,
    p_geo_city: ctx.geoCity,
  });

  if (error) {
    console.error("[identify] falha ao gravar visitante:", error);
    return json({ error: "storage_error" }, 500, headers);
  }

  // Follow-up de lead pela API oficial da Meta: só enfileira (regra desligada
  // = no-op). O envio confere de novo, na hora, se a pessoa já comprou.
  const telefone = norm(body.telefone);
  if (telefone) {
    after(async () => {
      const ready = await enqueueDispatch({
        areaId: area.id,
        trigger: "lead",
        sourceRef: userId,
        telefone,
        context: { nome: norm(body.nome), email: norm(body.email) },
      });
      if (ready) await processDispatchQueue({ areaId: area.id, limit: 20, maxMs: 20_000 });
    });
  }

  return json({ userId }, 200, headers);
}
