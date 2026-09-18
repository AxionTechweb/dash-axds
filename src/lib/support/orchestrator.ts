import "server-only";

import { getUmblerIntegration, sendUmblerMessage } from "@/lib/umbler/client";
import { notifyArea } from "@/lib/whatsapp/client";

import {
  generateContent,
  isFunctionCallPart,
  isTextPart,
  type GeminiContent,
} from "./gemini";
import { SUPPORT_SYSTEM_PROMPT } from "./prompt";
import { escalateToHuman, lookupPurchaseStatus, SUPPORT_TOOLS } from "./tools";

// Limite de idas-e-voltas de ferramenta por mensagem — evita loop infinito se
// o modelo insistir em chamar ferramentas sem nunca concluir.
const MAX_TOOL_LOOPS = 4;

async function runTool(
  areaId: string,
  chatId: string,
  contactPhone: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (name === "lookup_purchase_status") {
    return lookupPurchaseStatus(areaId, args as { phone?: string });
  }

  if (name === "escalate_to_human") {
    const reason = (args as { reason?: string }).reason;
    const result = await escalateToHuman(areaId, chatId, { reason });
    await notifyArea(
      areaId,
      `🙋 Cliente pediu atendimento humano no WhatsApp.\nMotivo: ${reason ?? "não informado"}\nChat: ${chatId}${contactPhone ? ` (${contactPhone})` : ""}`,
    );
    return result;
  }

  return { error: `ferramenta desconhecida: ${name}` };
}

/**
 * Processa uma mensagem recebida do cliente: chama o Gemini com as
 * ferramentas da Fase 1, executa o loop agentic (functionCall → executa →
 * functionResponse) até ele responder texto puro, e manda a resposta pelo
 * mesmo endpoint que um atendente humano usaria.
 *
 * Quando o modelo chama escalate_to_human, a conversa já foi marcada como
 * `mode = 'human'` dentro da ferramenta — a IA não manda mais nada, o
 * atendente responde pelo próprio app da Umbler.
 */
export async function handleInboundMessage(
  areaId: string,
  chatId: string,
  contactPhone: string | null,
  text: string,
): Promise<void> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) {
    console.error(`[support] sem integração Umbler ativa pra área ${areaId}`);
    return;
  }

  const contents: GeminiContent[] = [{ role: "user", parts: [{ text }] }];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const result = await generateContent(SUPPORT_SYSTEM_PROMPT, contents, SUPPORT_TOOLS);

    if (!result.ok) {
      console.error(`[support] falha no Gemini (área ${areaId}, chat ${chatId}):`, result.error);
      await escalateToHuman(areaId, chatId, { reason: "Falha técnica ao processar mensagem." });
      await notifyArea(
        areaId,
        `🤖 A IA de suporte falhou (erro técnico) e passou a conversa pra humano. Chat: ${chatId}`,
      );
      return;
    }

    contents.push(result.content);

    const functionCallPart = result.content.parts.find(isFunctionCallPart);

    if (!functionCallPart) {
      const answer = result.content.parts.find(isTextPart)?.text?.trim();
      if (answer) await sendUmblerMessage(integration, chatId, answer);
      return;
    }

    const { name, args, id } = functionCallPart.functionCall;
    const response = await runTool(areaId, chatId, contactPhone, name, args);

    if (name === "escalate_to_human") {
      // Humano assume a partir daqui — a IA não continua a conversa.
      return;
    }

    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, id, response } }],
    });
  }

  // Excedeu o limite de loops sem concluir — escalona por segurança em vez de
  // deixar o cliente sem resposta.
  await escalateToHuman(areaId, chatId, { reason: "IA não conseguiu concluir a resposta." });
  await notifyArea(
    areaId,
    `🤖 A IA de suporte não conseguiu concluir uma resposta e passou a conversa pra humano. Chat: ${chatId}`,
  );
}
