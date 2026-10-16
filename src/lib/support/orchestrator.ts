import "server-only";

import { shouldNotifyOnce } from "@/lib/alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUmblerIntegration, sendUmblerMessage } from "@/lib/umbler/client";
import { notifyArea, notifyNumber } from "@/lib/whatsapp/client";

import {
  generateContent,
  isFunctionCallItem,
  isMessageItem,
  type OpenAIInputContentPart,
  type OpenAIInputItem,
} from "./openai";
import { SUPPORT_SYSTEM_PROMPT } from "./prompt";
import {
  escalateToHuman,
  grantAccessTool,
  lookupAccessStatus,
  lookupPurchaseStatus,
  SUPPORT_TOOLS,
  tagAsTestimonial,
} from "./tools";

// Limite de idas-e-voltas de ferramenta por mensagem — evita loop infinito se
// o modelo insistir em chamar ferramentas sem nunca concluir. O fluxo de
// concessão de acesso sozinho já usa 3 (lookup_access_status →
// lookup_purchase_status → grant_access), por isso a margem.
const MAX_TOOL_LOOPS = 6;

// Mesmo dedup usado nos outros alertas (src/lib/alerts.ts) — sem isso, uma
// instabilidade/cota da OpenAI manda um aviso pro grupo a CADA mensagem de
// cliente que falha, em vez de uma vez só por episódio.
const AI_FAILURE_ALERT = "support_ai_openai_failure";
const LOOP_EXHAUSTED_ALERT = "support_ai_loop_exhausted";

// Mensagem fixa mandada ao cliente toda vez que a conversa é transferida pra
// humano — texto fixo em vez de deixar o modelo redigir, pra sempre sair
// exatamente com essa frase (pedido explícito do usuário), independente de
// como o modelo descreveu o motivo do escalonamento.
export const ESCALATION_NOTICE =
  "Por favor aguarde, irei transferir o seu atendimento para o nosso setor responsável";

// Número do setor que trata pedidos de reembolso — avisado à parte (além do
// aviso padrão pro grupo via notifyArea) sempre que o cliente insiste num
// reembolso/estorno mesmo depois da IA tentar entender e reverter.
const REFUND_ALERT_NUMBER = "5588981035979";

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
    const { reason, category } = args as { reason?: string; category?: string };
    const result = await escalateToHuman(areaId, chatId, { reason, category });
    await notifyArea(
      areaId,
      `🙋 Cliente pediu atendimento humano no WhatsApp.\nMotivo: ${reason ?? "não informado"}\nChat: ${chatId}${contactPhone ? ` (${contactPhone})` : ""}`,
    );
    if (category === "reembolso_estorno") {
      await notifyNumber(
        areaId,
        REFUND_ALERT_NUMBER,
        `💸 A cliente do número ${contactPhone ?? chatId} está pedindo reembolso.\nMotivo: ${reason ?? "não informado"}`,
      );
    }
    return result;
  }

  if (name === "tag_as_testimonial") {
    return tagAsTestimonial(areaId, chatId);
  }

  return { error: `ferramenta desconhecida: ${name}` };
}

/**
 * Processa uma mensagem recebida do cliente: chama a OpenAI (gpt-6-luna, via
 * Responses API) com as ferramentas de suporte, executa o loop agentic
 * (function_call → executa → function_call_output) até ela responder texto
 * puro, e manda a resposta pelo mesmo endpoint que um atendente humano usaria.
 *
 * A Responses API é STATEFUL (`previous_response_id` encadeia o turno
 * anterior) — diferente do client antigo do Gemini, só manda o item NOVO a
 * cada chamada, nunca a conversa inteira de novo.
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
  image?: { mimeType: string; base64: string } | null,
): Promise<void> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) {
    console.error(`[support] sem integração Umbler ativa pra área ${areaId}`);
    return;
  }

  // Imagem (ex.: print de pagamento) entra como mais uma parte da mesma
  // mensagem — o gpt-6-luna lê nativamente, sem precisar de modelo separado
  // (diferente do áudio, que usa o Transcribe dedicado antes de chegar aqui).
  const firstMessageContent: OpenAIInputContentPart[] = [];
  if (text) firstMessageContent.push({ type: "input_text", text });
  if (image) {
    firstMessageContent.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.base64}`,
      detail: "auto",
    });
  }
  if (firstMessageContent.length === 0) {
    firstMessageContent.push({ type: "input_text", text: "" });
  }

  let input: OpenAIInputItem[] = [{ role: "user", content: firstMessageContent }];
  let previousResponseId: string | null = null;
  const admin = createAdminClient();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const result = await generateContent(
      SUPPORT_SYSTEM_PROMPT,
      input,
      SUPPORT_TOOLS,
      previousResponseId,
    );

    if (!result.ok) {
      console.error(
        `[support] falha na OpenAI (área ${areaId}, chat ${chatId}):`,
        result.error,
      );
      await escalateToHuman(areaId, chatId, {
        reason: "Falha técnica ao processar mensagem.",
      });
      await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
      if (await shouldNotifyOnce(admin, areaId, AI_FAILURE_ALERT, true)) {
        await notifyArea(
          areaId,
          `🤖 A IA de suporte está falhando (erro técnico na OpenAI) e as conversas estão sendo passadas pra humano automaticamente até normalizar.\nÚltimo erro: ${result.error}`,
        );
      }
      return;
    }

    // Respondeu com sucesso — conta como "ok" pra eventualmente rearmar o
    // alerta acima, caso tenha disparado antes.
    await shouldNotifyOnce(admin, areaId, AI_FAILURE_ALERT, false);

    previousResponseId = result.responseId;

    const functionCalls = result.output.filter(isFunctionCallItem);

    if (functionCalls.length === 0) {
      const message = result.output.find(isMessageItem);
      const answer = message?.content.find((c) => c.type === "output_text")?.text?.trim();
      if (answer) await sendUmblerMessage(integration, chatId, answer);
      await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, false);
      return;
    }

    // O modelo pode pedir mais de uma ferramenta no mesmo turno
    // (parallel_tool_calls, ligado por padrão) — executa todas antes de
    // continuar, senão o response_id seguinte fica sem resposta pra alguma
    // delas e a API rejeita.
    let escalated = false;
    const outputs: OpenAIInputItem[] = [];
    for (const call of functionCalls) {
      const args = call.arguments ? JSON.parse(call.arguments) : {};
      const response = await runTool(areaId, chatId, contactPhone, call.name, args);
      if (call.name === "escalate_to_human") escalated = true;
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(response),
      });
    }

    if (escalated) {
      // Humano assume a partir daqui — a IA não continua a conversa. O aviso
      // é texto fixo (ESCALATION_NOTICE), não o que o modelo redigiu, pra
      // sempre sair com a frase exata pedida.
      await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
      await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, false);
      return;
    }

    input = outputs;
  }

  // Excedeu o limite de loops sem concluir — escalona por segurança em vez de
  // deixar o cliente sem resposta.
  await escalateToHuman(areaId, chatId, {
    reason: "IA não conseguiu concluir a resposta.",
  });
  await sendUmblerMessage(integration, chatId, ESCALATION_NOTICE);
  if (await shouldNotifyOnce(admin, areaId, LOOP_EXHAUSTED_ALERT, true)) {
    await notifyArea(
      areaId,
      `🤖 A IA de suporte não está conseguindo concluir respostas (loop de ferramentas sem parar) e as conversas estão sendo passadas pra humano.`,
    );
  }
}
