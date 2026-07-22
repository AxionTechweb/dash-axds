import { z } from "zod";

import {
  guardCapture,
  handlePreflight,
  json,
  norm,
  tokenFrom,
} from "@/lib/capture";
import { isValidVisitorId } from "@/lib/ids";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/event — registra um evento (page_view, initiate_checkout, ...).
 *
 * Público (chamado pelo snippet). Apenas GRAVA em events_log, enriquecendo com
 * os dados do visitante quando o payload não trouxer. NADA é disparado para
 * plataformas externas — este sistema não envia conversões.
 */

export const dynamic = "force-dynamic";

const EventSchema = z.object({
  a: z.string().max(128).optional(),
  userId: z.string().max(64),
  // Nome do evento: minúsculas, números e underscore.
  eventName: z.string().regex(/^[a-z0-9_]{1,40}$/, "evento inválido"),
  utm_source: z.string().max(255).optional().nullable(),
  utm_medium: z.string().max(255).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(),
  utm_term: z.string().max(255).optional().nullable(),
  utm_content: z.string().max(255).optional().nullable(),
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

  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_payload" }, 400);
  }
  const body = parsed.data;

  if (!isValidVisitorId(body.userId)) {
    return json({ error: "invalid_user_id" }, 400);
  }

  const token = tokenFrom(request, body);
  // Limite mais folgado que o identify: uma sessão gera vários eventos.
  const guard = await guardCapture(request, token, "event", 300, 60);
  if (!guard.ok) return guard.response;

  const { area, ctx, headers } = guard;

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_event", {
    p_area_id: area.id,
    p_user_id: body.userId,
    p_event_name: body.eventName,
    p_utm_source: norm(body.utm_source),
    p_utm_medium: norm(body.utm_medium),
    p_utm_campaign: norm(body.utm_campaign),
    p_utm_term: norm(body.utm_term),
    p_utm_content: norm(body.utm_content),
    p_ip: ctx.ip,
    p_geo_country: ctx.geoCountry,
    p_geo_region: ctx.geoRegion,
    p_geo_city: ctx.geoCity,
  });

  if (error) {
    console.error("[event] falha ao gravar evento:", error);
    return json({ error: "storage_error" }, 500, headers);
  }

  return json({ ok: true }, 200, headers);
}
