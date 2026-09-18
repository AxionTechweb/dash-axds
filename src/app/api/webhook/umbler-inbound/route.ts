import { json } from "@/lib/capture";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleInboundMessage } from "@/lib/support/orchestrator";
import { safeEqual } from "@/lib/webhooks/common";

/**
 * POST /api/webhook/umbler-inbound?a=<public_token_da_area>
 *
 * Recebe eventos "Message" da Umbler Talk (cadastrado manualmente no painel
 * web — a API bloqueia registro de webhook por código, ver src/lib/umbler/client.ts).
 *
 * Autenticação: a Umbler NÃO assina o webhook nativamente (confirmado
 * inspecionando os headers reais recebidos — nenhum é específico da Umbler,
 * só infraestrutura da própria Vercel). Por isso, diferente do webhook de
 * checkout, aqui o token da URL não é só roteamento: é a autenticação. O
 * Organization.Id do payload é uma segunda checagem, contra a organização
 * cadastrada em `umbler_integrations` pra essa área.
 *
 * Payload real capturado (evento "Message"):
 * {Type, EventDate, Payload:{Type:"Chat", Content:{Id, Organization:{Id},
 *   Contact:{PhoneNumber, Name, Id}, Channel:{...}, LastMessage:{Content,
 *   Source, MessageType, ...}}}, EventId}
 * `LastMessage.Source === "Contact"` distingue mensagem do cliente de eco de
 * mensagem enviada por nós (`"Member"`).
 */

export const dynamic = "force-dynamic";

type UmblerWebhookPayload = {
  Type?: string;
  Payload?: {
    Content?: {
      Id?: string;
      Organization?: { Id?: string };
      Contact?: { PhoneNumber?: string };
      LastMessage?: { Content?: string; Source?: string };
    };
  };
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("a") ?? "";
  if (!token) return json({ error: "missing_area_token" }, 400);

  if (!(await rateLimit(`webhook:umbler-inbound:${token}`, 120, 60))) {
    return json({ error: "rate_limited" }, 429);
  }

  const admin = createAdminClient();

  const { data: area } = await admin
    .from("areas")
    .select("id")
    .eq("public_token", token)
    .maybeSingle();
  if (!area) return json({ error: "area_not_found" }, 404);

  const { data: integration } = await admin
    .from("umbler_integrations")
    .select("organization_id, enabled")
    .eq("area_id", area.id)
    .maybeSingle();
  if (!integration?.enabled) return json({ error: "integration_disabled" }, 404);

  let body: UmblerWebhookPayload;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const chat = body.Payload?.Content;
  const orgId = chat?.Organization?.Id;

  if (!orgId || !safeEqual(orgId, integration.organization_id as string)) {
    return json({ error: "organization_mismatch" }, 401);
  }

  if (body.Type !== "Message" || !chat) {
    return json({ ok: true, ignored: "not_a_message_event" }, 200);
  }

  const lastMessage = chat.LastMessage;
  if (!lastMessage || lastMessage.Source !== "Contact") {
    return json({ ok: true, ignored: "not_from_contact" }, 200);
  }

  const chatId = chat.Id;
  const contactPhone = chat.Contact?.PhoneNumber ?? null;
  const text = lastMessage.Content ?? "";
  if (!chatId || !text) {
    return json({ ok: true, ignored: "missing_chat_or_text" }, 200);
  }

  // Não sobrescreve `mode` num conflito — só os campos abaixo entram no SET,
  // então uma sessão já em modo humano continua em modo humano.
  const { data: session, error: upsertError } = await admin
    .from("support_ai_sessions")
    .upsert(
      {
        area_id: area.id,
        chat_id: chatId,
        contact_phone: contactPhone,
        last_customer_message_at: new Date().toISOString(),
      },
      { onConflict: "area_id,chat_id" },
    )
    .select("mode")
    .single();

  if (upsertError || !session) {
    console.error("[umbler-inbound] falha ao gravar sessão de suporte:", upsertError);
    return json({ ok: true, ignored: "session_upsert_failed" }, 200);
  }

  if (session.mode === "ai") {
    try {
      await handleInboundMessage(area.id, chatId, contactPhone, text);
    } catch (err) {
      console.error(`[umbler-inbound] falha no orquestrador (chat ${chatId}):`, err);
    }
  }

  return json({ ok: true }, 200);
}
