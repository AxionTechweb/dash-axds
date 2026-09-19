import "server-only";

import { shouldNotifyOnce } from "@/lib/alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUmblerIntegration, sendUmblerMessage } from "@/lib/umbler/client";
import { notifyArea } from "@/lib/whatsapp/client";

import {
  generateContent,
  isFunctionCallPart,
  isTextPart,
  type GeminiContent,
} from "./gemini";
import { SUPPORT_SYSTEM_PROMPT } from "./prompt";
import {
  escalateToHuman,
  grantAccessTool,
  lookupAccessStatus,
  lookupPurchaseStatus,
  SUPPORT_TOOLS,
} from "./tools";

// Limite de idas-e-voltas de ferramenta por mensagem — evita loop infinito se
// o modelo insistir em chamar ferramentas sem nunca concluir. O fluxo de
// concessão de acesso sozinho já usa 3 (lookup_access_status →
// lookup_purchase_status → grant_access), por isso a margem.
const MAX_TOOL_LOOPS = 6;

// Mesmo dedup usado nos outros alertas (src/lib/alerts.ts) — sem isso, uma
// instabilidade/cota do Gemini manda um aviso pro grupo a CADA mensagem de
// cliente que falha, em vez de uma vez só por episódio.
const GEMINI_FAILURE_ALERT = "support_ai_gemini_failure";
const LOOP_EXHAUSTED_ALERT = "support_ai_loop_exhausted";

async function runTool(
  areaId: string,
  chatId: string,
  contactPhone: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (name === "lookup_purchase_status") {
    return lookupPurchaseStatus(areaId, contactPhone);
  }

  if (name === "lookup_access_status") {
    return lookupAccessStatus(args as { email?: string });
  }

  if (name === "grant_access") {
    return grantAccessTool(areaId, contactPhone, args as { email?: string });
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
  const admin = createAdminClient();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const result = await generateContent(SUPPORT_SYSTEM_PROMPT, contents, SUPPORT_TOOLS);

    if (!result.ok) {
      console.error(`[support] falha no Gemini (área ${areaId}, chat ${chatId}):`, result.error);
      await escalateToHuman(areaId, chatId, { reason: "Falha técnica ao processar mensagem." });
      if (await shouldNotifyOnce(admin, areaId, GEMINI_FAILURE_ALERT, true)) {
        await notifyArea(
          areaId,
          `🤖 A IA de suporte está falhando (erro técnico no Gemini) e as conversas estão sendo passadas pra humano automaticamente até normalizar.\nÚltimo erro: ${result.error}`,
        );
      }
      return;
    }

    // Gemini respondeu com sucesso — conta como "ok" pra eventualmente rearmar
    // o alerta acima, caso tenha disparado antes.
    await shouldNotifyOnce(admin, areaId, GEMINI_FAILURE_ALERT, false);

    contents.push(result.content);

    const functionCallPart = result.content.parts.find(isFunctionCallPart);

    if (!functionCallPart) {
      const answer = result.content.parts.find(isTextPart)?.text?.trim();
      if (answer) await sendUmblerMessage(integration, chatId, answer);
      await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, false);
      return;
    }

    const { name, args, id } = functionCallPart.functionCall;
    const response = await runTool(areaId, chatId, contactPhone, name, args);

    if (name === "escalate_to_human") {
      // Humano assume a partir daqui — a IA não continua a conversa.
      await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, false);
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
  if (await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, true)) {
    await notifyArea(
      areaId,
      `🤖 A IA de suporte não está conseguindo concluir respostas (loop de ferramentas sem parar) e as conversas estão sendo passadas pra humano.`,
    );
  }
}
