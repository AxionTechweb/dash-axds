import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUmblerIntegration,
  getUmblerMessagesSince,
} from "@/lib/umbler/client";
import { notifyArea } from "@/lib/whatsapp/client";

import { handleInboundMessage } from "./orchestrator";

/**
 * Watchdog de handoff: uma conversa escalonada pra humano (support_ai_sessions
 * .mode = "human") pode ficar esquecida se ninguém no time responder — a IA
 * nunca mais volta a falar com o cliente sozinha, por design (ver
 * orchestrator.ts). Esse job acha essas conversas paradas há muito tempo e
 * devolve pra IA automaticamente, pra nunca deixar o cliente sem resposta
 * por tempo demais (pedido explícito do usuário).
 *
 * `last_customer_message_at` só é atualizado quando O CLIENTE manda mensagem
 * (nunca quando um humano responde pelo app da Umbler — isso acontece fora do
 * nosso sistema) — por isso "faz tempo que o cliente mandou mensagem" sozinho
 * NÃO prova que ninguém respondeu. A checagem real é contra a API da Umbler:
 * busca as mensagens depois da última do cliente e vê se alguma tem
 * `source !== "Contact"` (humano ou nós) — só aí é silêncio de verdade.
 */

const STALE_HOURS = 4;

export type HandoffWatchdogAreaResult = {
  areaId: string;
  checked: number;
  resumed: number;
  errors: string[];
};

export async function runHandoffWatchdogForAllAreas(): Promise<
  HandoffWatchdogAreaResult[]
> {
  const admin = createAdminClient();

  const { data: integrations } = await admin
    .from("umbler_integrations")
    .select("area_id")
    .eq("enabled", true);
  if (!integrations?.length) return [];

  const results: HandoffWatchdogAreaResult[] = [];
  for (const row of integrations) {
    const areaId = row.area_id as string;
    results.push(await runForArea(admin, areaId));
  }
  return results;
}

async function runForArea(
  admin: ReturnType<typeof createAdminClient>,
  areaId: string,
): Promise<HandoffWatchdogAreaResult> {
  const errors: string[] = [];
  let checked = 0;
  let resumed = 0;

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleSessions } = await admin
    .from("support_ai_sessions")
    .select("chat_id, contact_phone, last_customer_message_at")
    .eq("area_id", areaId)
    .eq("mode", "human")
    .lt("last_customer_message_at", cutoff);

  if (!staleSessions?.length) return { areaId, checked: 0, resumed: 0, errors: [] };

  const integration = await getUmblerIntegration(areaId);
  if (!integration) {
    return {
      areaId,
      checked: 0,
      resumed: 0,
      errors: ["sem integração Umbler ativa pra essa área"],
    };
  }

  for (const session of staleSessions) {
    checked += 1;
    const chatId = session.chat_id as string;
    const contactPhone = (session.contact_phone as string | null) ?? null;
    const lastCustomerAt = session.last_customer_message_at as string;

    try {
      // Pequena folga pra trás pra não perder a própria mensagem que marcou
      // `last_customer_message_at`, caso a API trate o instante como exclusive.
      const since = new Date(
        new Date(lastCustomerAt).getTime() - 2000,
      ).toISOString();

      const { messages, error } = await getUmblerMessagesSince(
        integration,
        chatId,
        since,
      );
      if (error) {
        errors.push(`${chatId}: ${error}`);
        continue;
      }

      const jaRespondido = messages.some(
        (m) =>
          m.source &&
          m.source !== "Contact" &&
          m.eventAtUTC &&
          m.eventAtUTC > lastCustomerAt,
      );
      if (jaRespondido) continue;

      // Monta o texto das mensagens do cliente ainda sem resposta — junta
      // tudo numa mensagem só pra IA ter o contexto completo de uma vez, em
      // vez de só a última. Áudio/imagem não são reprocessados aqui (fora do
      // escopo deste job); só avisa que existiram, pra IA poder perguntar.
      const pendentes = messages.filter((m) => m.source === "Contact");
      const partes: string[] = [];
      for (const m of pendentes) {
        if (m.messageType === "Text" && m.content) {
          partes.push(m.content);
        } else if (m.messageType === "Audio") {
          partes.push("[o cliente mandou um áudio aqui que não foi processado]");
        } else if (m.messageType === "Image") {
          partes.push("[o cliente mandou uma imagem aqui que não foi processada]");
        }
      }
      const texto = partes.join("\n").trim();
      if (!texto) continue;

      await admin
        .from("support_ai_sessions")
        .update({ mode: "ai", escalation_reason: null })
        .eq("area_id", areaId)
        .eq("chat_id", chatId);

      await handleInboundMessage(areaId, chatId, contactPhone, texto);
      resumed += 1;

      await notifyArea(
        areaId,
        `⏰ Conversa sem resposta humana há mais de ${STALE_HOURS}h — a IA retomou o atendimento automaticamente.\nChat: ${chatId}${contactPhone ? ` (${contactPhone})` : ""}`,
      );
    } catch (err) {
      errors.push(
        `${chatId}: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }

  return { areaId, checked, resumed, errors };
}
