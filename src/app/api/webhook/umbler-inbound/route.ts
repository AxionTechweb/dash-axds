import { json } from "@/lib/capture";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESCALATION_NOTICE, handleInboundMessage } from "@/lib/support/orchestrator";
import { transcribeAudio } from "@/lib/support/transcribe";
import { escalateToHuman } from "@/lib/support/tools";
import { getUmblerIntegration, sendUmblerMessage } from "@/lib/umbler/client";
import { notifyArea } from "@/lib/whatsapp/client";
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
 *
 * `MessageType: "Audio"` (nota de voz) e `"Image"` (foto) — confirmados
 * contra o schema oficial da API da Umbler (`MessageTypes`/`MessageFileModel`
 * no swagger) — vêm com `LastMessage.File.Url` apontando direto pro arquivo,
 * sem chamada extra. Áudio é transcrito via Gemini 3.5 Transcribe
 * (src/lib/support/transcribe.ts) antes de virar texto; imagem vai direto
 * pro Gemini como parte da mensagem (ele lê nativamente, sem modelo à parte).
 */

export const dynamic = "force-dynamic";

// Textos dos botões de resposta rápida dos templates oficiais de WhatsApp
// que uma automação externa (Payt → Make) dispara sozinha em paralelo
// (compra_aprovada, compra_recusada, cadastro_abandonado, compra_cancelada)
// — o clique chega aqui como uma mensagem normal do cliente e, sem essa
// checagem, a IA tentava responder de novo por cima do que a automação já
// resolve sozinha (ex.: já manda o link de acesso), gerando respostas
// duplicadas/conflitantes na mesma conversa.
//
// Detecção pelo `MessageType: "ButtonReply"` (confirmado contra o histórico
// real de uma conversa via API da Umbler), NUNCA só pelo texto — um cliente
// de verdade pode digitar livremente algo como "quero tentar novamente",
// que bateria com o texto do botão por coincidência mas é `MessageType:
// "Text"`, não um clique de botão, e precisa continuar indo pra IA.
const AUTOMATION_BUTTON_IGNORE = new Set([
  "liberar acesso",
  "tentar novamente",
  "nova tentativa",
]);
const AUTOMATION_BUTTON_SUPPORT = "falar com suporte";

// Visto na prática: o download de uma imagem falhou na hora exata do
// webhook, mas a mesma URL funcionava normal minutos depois (falha
// transitória de rede/disponibilidade, não um problema de permissão ou URL
// expirada) — sem retry, isso escalonava pra humano à toa.
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 800;

async function downloadAsBase64(
  fileUrl: string,
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  let lastError = "falha no download";

  for (let attempt = 0; attempt < DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(fileUrl);
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
      } else {
        const buffer = Buffer.from(await res.arrayBuffer());
        return { ok: true, base64: buffer.toString("base64") };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "falha no download";
    }

    if (attempt < DOWNLOAD_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, DOWNLOAD_RETRY_DELAY_MS));
    }
  }

  return { ok: false, error: lastError };
}

type UmblerWebhookPayload = {
  Type?: string;
  EventId?: string;
  Payload?: {
    Content?: {
      Id?: string;
      Organization?: { Id?: string };
      Contact?: { PhoneNumber?: string };
      LastMessage?: {
        Content?: string;
        Source?: string;
        MessageType?: string;
        File?: { Url?: string; ContentType?: string };
      };
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
  if (!integration?.enabled)
    return json({ error: "integration_disabled" }, 404);

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
  if (!chatId) {
    return json({ ok: true, ignored: "missing_chat_id" }, 200);
  }

  // Dedup ANTES de transcrever áudio (abaixo) — a Umbler pode reenviar o
  // mesmo evento "Message" mais de uma vez (retry, webhooks duplicados,
  // etc.); sem essa checagem a IA respondia a mesma mensagem várias vezes
  // seguidas, e um retry chegaria a pagar a transcrição de novo à toa.
  const eventId = body.EventId ?? null;
  if (eventId) {
    const { data: existing } = await admin
      .from("support_ai_sessions")
      .select("last_event_id")
      .eq("area_id", area.id)
      .eq("chat_id", chatId)
      .maybeSingle();
    if (existing?.last_event_id && existing.last_event_id === eventId) {
      return json({ ok: true, ignored: "duplicate_event" }, 200);
    }
  }

  // Nota de voz: transcreve antes de tratar como texto — o resto do fluxo
  // (botões de template, IA) passa a enxergar a transcrição normalmente,
  // sem precisar saber que a mensagem original era áudio.
  let text = lastMessage.Content ?? "";
  let audioTranscriptionFailed = false;
  if (lastMessage.MessageType === "Audio") {
    const fileUrl = lastMessage.File?.Url;
    if (!fileUrl) {
      audioTranscriptionFailed = true;
    } else {
      const result = await transcribeAudio(
        fileUrl,
        lastMessage.File?.ContentType || "audio/ogg",
      );
      if (result.ok) {
        text = result.text;
      } else {
        console.error(
          `[umbler-inbound] falha ao transcrever áudio (chat ${chatId}):`,
          result.error,
        );
        audioTranscriptionFailed = true;
      }
    }
  }

  // Imagem (ex.: print de pagamento): baixa e manda como parte da mensagem —
  // o Gemini lê nativamente, não precisa de transcrição prévia. Legenda (se
  // tiver) continua em `text` normalmente, junto da imagem.
  let image: { mimeType: string; base64: string } | null = null;
  let imageDownloadFailed = false;
  if (lastMessage.MessageType === "Image") {
    const fileUrl = lastMessage.File?.Url;
    if (!fileUrl) {
      imageDownloadFailed = true;
    } else {
      const result = await downloadAsBase64(fileUrl);
      if (result.ok) {
        image = {
          mimeType: lastMessage.File?.ContentType || "image/jpeg",
          base64: result.base64,
        };
      } else {
        console.error(
          `[umbler-inbound] falha ao baixar imagem (chat ${chatId}):`,
          result.error,
        );
        imageDownloadFailed = true;
      }
    }
  }

  if (!text && !audioTranscriptionFailed && !image && !imageDownloadFailed) {
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
        last_event_id: eventId,
      },
      { onConflict: "area_id,chat_id" },
    )
    .select("mode")
    .single();

  if (upsertError || !session) {
    console.error(
      "[umbler-inbound] falha ao gravar sessão de suporte:",
      upsertError,
    );
    return json({ ok: true, ignored: "session_upsert_failed" }, 200);
  }

  // Áudio sem transcrição: nunca manda texto vazio/quebrado pra IA — escalona
  // direto, mesma rede de segurança usada pra qualquer outra falha técnica.
  if (audioTranscriptionFailed) {
    await escalateToHuman(area.id, chatId, {
      reason:
        "Cliente mandou um áudio que não conseguimos transcrever automaticamente.",
    });
    const integration = await getUmblerIntegration(area.id);
    if (integration) await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
    await notifyArea(
      area.id,
      `🎙️ Áudio não transcrito automaticamente.\nChat: ${chatId}${contactPhone ? ` (${contactPhone})` : ""}`,
    );
    return json({ ok: true, ignored: "audio_transcription_failed" }, 200);
  }

  if (imageDownloadFailed) {
    await escalateToHuman(area.id, chatId, {
      reason:
        "Cliente mandou uma imagem que não conseguimos baixar automaticamente.",
    });
    const integration = await getUmblerIntegration(area.id);
    if (integration) await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
    await notifyArea(
      area.id,
      `🖼️ Imagem não processada automaticamente.\nChat: ${chatId}${contactPhone ? ` (${contactPhone})` : ""}`,
    );
    return json({ ok: true, ignored: "image_download_failed" }, 200);
  }

  const normalizedText = text.trim().toLowerCase();
  const isButtonReply = lastMessage.MessageType === "ButtonReply";

  if (isButtonReply && AUTOMATION_BUTTON_IGNORE.has(normalizedText)) {
    return json({ ok: true, ignored: "automation_button_click" }, 200);
  }

  // Clique em "Falar com Suporte": NÃO escalona de cara pra humano — manda
  // pra IA como uma mensagem normal, com um texto que deixa claro pra ela
  // que foi um pedido de atendimento (o prompt instrui a tentar entender e
  // resolver o problema antes de chamar escalate_to_human de verdade).
  if (isButtonReply && normalizedText === AUTOMATION_BUTTON_SUPPORT) {
    text = "[Cliente clicou no botão \"Falar com Suporte\" pedindo atendimento humano]";
  }

  if (session.mode === "ai") {
    try {
      await handleInboundMessage(area.id, chatId, contactPhone, text, image);
    } catch (err) {
      // Rede de segurança: handleInboundMessage já escalona sozinho quando o
      // Gemini falha (ver orchestrator.ts), mas uma exceção em qualquer OUTRO
      // ponto da cadeia (ex.: uma ferramenta, uma query) caía só no console,
      // sem escalonar — cliente ficava sem resposta E sem aviso pra ninguém,
      // em silêncio total. Garante que toda falha vira, no mínimo, handoff
      // pra humano em vez de desaparecer.
      console.error(
        `[umbler-inbound] falha no orquestrador (chat ${chatId}):`,
        err,
      );
      try {
        await escalateToHuman(area.id, chatId, {
          reason: "Falha técnica ao processar mensagem (erro fora do Gemini).",
        });
        const integration = await getUmblerIntegration(area.id);
        if (integration) {
          await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
        }
      } catch (escalateErr) {
        console.error(
          `[umbler-inbound] falha ao escalonar após erro (chat ${chatId}):`,
          escalateErr,
        );
      }
    }
  }

  return json({ ok: true }, 200);
}
