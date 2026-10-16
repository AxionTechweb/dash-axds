import "server-only";

import { suggestEmailTypoFix } from "@/lib/email-typo";
import { checkAccess, grantAccess } from "@/lib/lovable/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { addChatTag, getUmblerIntegration } from "@/lib/umbler/client";

import type { OpenAITool } from "./openai";

/**
 * Tag "Elogio Depoimento" no Umbler Talk — criada manualmente via API nesta
 * área (o nome tem espaço, não barra: a Umbler só aceita letras/números/
 * espaço no nome da tag, `^[a-zA-ZÀ-ÿ 0-9]{1,}$`, rejeitaria
 * "Elogio/Depoimento"). ID fixo porque criar uma tag por chamada seria
 * caro à toa — só muda se a tag for apagada/recriada manualmente na Umbler.
 */
const TESTIMONIAL_TAG_ID = "askz4797xlVnapSZ";

/** 8-11 dígitos finais — mesma normalização já usada pro match visitante/compra. */
function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

// suggestEmailTypoFix (distância de edição <= 2 contra provedores comuns)
// agora vive em @/lib/email-typo — compartilhada com a correção automática
// no webhook de compra (src/app/api/webhook/[plataforma]/route.ts).

const STATUS_LABEL: Record<string, string> = {
  approved: "aprovada",
  pending: "pagamento pendente",
  waiting_payment: "aguardando confirmação de pagamento",
  abandoned: "checkout abandonado, não finalizado",
  refunded: "reembolsada",
  chargeback: "chargeback",
  canceled: "cancelada",
};

/**
 * Ferramentas da Fase 1: uma de leitura (autonomia total) e uma que sempre
 * está disponível pra qualquer intenção que a IA não deva decidir sozinha
 * (autonomia nenhuma) — não existe ferramenta de reembolso/estorno de propósito.
 */
export const SUPPORT_TOOLS: OpenAITool[] = [
  {
    type: "function",
    name: "lookup_purchase_status",
    description:
      "Consulta a compra mais recente do cliente. Já usa automaticamente o telefone do WhatsApp de onde ele está falando — NÃO peça o telefone ao cliente, você já sabe qual é. Use sempre que o cliente perguntar sobre status de pedido, pagamento, acesso ou reembolso — nunca invente um status sem chamar essa ferramenta.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "lookup_access_status",
    description:
      "Verifica se um e-mail tem acesso ativo à plataforma do Programa Active. Use quando o cliente disser que está sem acesso, não consegue entrar/logar, ou perguntar se o acesso já foi liberado. Telefone do WhatsApp NÃO serve aqui — se ainda não tiver o e-mail do cliente na conversa, peça antes de chamar essa ferramenta. Pode devolver possible_typo:true com um suggested_email quando o e-mail digitado parece ter erro de digitação no domínio e a versão corrigida já tem acesso — nesse caso, confirme com o cliente antes de prosseguir.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "E-mail do cliente cadastrado na plataforma.",
        },
      },
      required: ["email"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "grant_access",
    description:
      "Concede acesso à plataforma pra um cliente que pagou mas está sem acesso. SÓ chame depois de confirmar com lookup_purchase_status que existe uma compra aprovada — esta ferramenta confere isso de novo sozinha e recusa se não achar uma compra aprovada, então não adianta chamar sem verificar antes. Use quando lookup_access_status mostrar has_access false para um cliente com pagamento aprovado.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description:
            "E-mail do cliente cadastrado na plataforma, o mesmo já usado em lookup_access_status.",
        },
      },
      required: ["email"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "escalate_to_human",
    description:
      "Transfere a conversa para um atendente humano e avisa a equipe. Use quando o cliente insistir em reembolso/estorno/cancelamento mesmo depois de você tentar entender o motivo e reverter, ou quando ele pedir atendimento humano / clicar em 'Falar com Suporte' e, mesmo depois de você tentar entender e resolver o problema com as ferramentas e FAQs disponíveis, não for possível resolver sozinho.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Resumo curto do motivo do escalonamento, para o atendente humano.",
        },
        category: {
          type: "string",
          enum: ["reembolso_estorno", "outro"],
          description:
            "'reembolso_estorno' quando o cliente insistiu em pedido de reembolso/estorno/cancelamento — dispara um aviso extra pro setor financeiro. 'outro' para qualquer outro motivo de escalonamento.",
        },
      },
      required: ["reason", "category"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "tag_as_testimonial",
    description:
      "Marca a conversa com a tag 'Elogio Depoimento' no Umbler. Use sempre que o cliente elogiar o programa, agradecer de forma genuína pelo resultado, ou contar um resultado real (ex.: emagreceu, melhorou algum sintoma, está satisfeito com o protocolo). NÃO interrompe a conversa nem impede de continuar respondendo normalmente — só marca pra equipe de marketing achar depois.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
];

export async function lookupPurchaseStatus(
  areaId: string,
  contactPhone: string | null,
): Promise<Record<string, unknown>> {
  const digits = phoneDigits(contactPhone);
  if (!digits) return { found: false, error: "telefone do contato inválido" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("purchases")
    .select("produto, status, valor, created_at, telefone")
    .eq("area_id", areaId)
    .not("telefone", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  const match = (data ?? []).find(
    (row) => phoneDigits(row.telefone as string | null) === digits,
  );
  if (!match) return { found: false };

  return {
    found: true,
    produto: match.produto,
    status: STATUS_LABEL[match.status as string] ?? match.status,
    valor: match.valor,
    data_compra: match.created_at,
  };
}

export async function lookupAccessStatus(args: {
  email?: string;
}): Promise<Record<string, unknown>> {
  const email = args.email?.trim();
  if (!email) return { error: "e-mail inválido" };

  const result = await checkAccess(email);
  if ("error" in result) return { error: result.error };
  if (result.found)
    return { found: true, has_access: result.hasAccess, email: result.email };

  // Não achou com o e-mail exato — confere se é um erro comum de digitação
  // no domínio (ex.: "hotmali.com" em vez de "hotmail.com") cujo e-mail
  // corrigido JÁ tem acesso, pra IA poder confirmar com o cliente em vez de
  // só dizer "não encontrei" (mesmo tipo de correção que um atendente humano
  // já faz na prática).
  const suggested = suggestEmailTypoFix(email.toLowerCase());
  if (suggested) {
    const suggestedResult = await checkAccess(suggested);
    if (!("error" in suggestedResult) && suggestedResult.found) {
      return { found: false, possible_typo: true, suggested_email: suggested };
    }
  }

  return { found: false };
}

/**
 * Confere DE NOVO, no código, se existe compra aprovada pro telefone/e-mail —
 * usada por grant_access pra nunca depender só da IA ter "achado" que viu uma
 * compra aprovada numa chamada anterior. Casa por telefone OU e-mail: o
 * telefone vem do contato do WhatsApp (mais confiável), o e-mail é o que o
 * cliente informou na conversa.
 */
async function findApprovedPurchase(
  areaId: string,
  { phone, email }: { phone?: string | null; email?: string | null },
): Promise<{ produto: string; created_at: string } | null> {
  const digits = phoneDigits(phone);
  const emailNorm = email?.trim().toLowerCase() || null;
  if (!digits && !emailNorm) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("purchases")
    .select("produto, created_at, telefone, email")
    .eq("area_id", areaId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(5000);

  const match = (data ?? []).find((row) => {
    if (digits && phoneDigits(row.telefone as string | null) === digits)
      return true;
    if (
      emailNorm &&
      (row.email as string | null)?.trim().toLowerCase() === emailNorm
    )
      return true;
    return false;
  });

  return match
    ? {
        produto: match.produto as string,
        created_at: match.created_at as string,
      }
    : null;
}

export async function grantAccessTool(
  areaId: string,
  contactPhone: string | null,
  args: { email?: string },
): Promise<Record<string, unknown>> {
  const email = args.email?.trim();
  if (!email) return { granted: false, reason: "e-mail inválido" };

  const purchase = await findApprovedPurchase(areaId, {
    phone: contactPhone,
    email,
  });
  if (!purchase) {
    return {
      granted: false,
      reason:
        "nenhuma compra aprovada encontrada pra esse telefone/e-mail — não é seguro conceder acesso",
    };
  }

  const result = await grantAccess(email);
  if (!result.ok) return { granted: false, reason: result.error };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    area_id: areaId,
    actor_email: null,
    action: "support_ai_grant_access",
    target_type: "lovable_access",
    details: {
      email,
      contact_phone: contactPhone,
      matched_purchase: purchase,
      already_had_access: result.alreadyHadAccess,
    },
  });

  return { granted: true, already_had_access: result.alreadyHadAccess };
}

export async function escalateToHuman(
  areaId: string,
  chatId: string,
  args: { reason?: string; category?: string },
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();

  await admin
    .from("support_ai_sessions")
    .update({ mode: "human", escalation_reason: args.reason ?? null })
    .eq("area_id", areaId)
    .eq("chat_id", chatId);

  await admin.from("audit_log").insert({
    area_id: areaId,
    actor_email: null,
    action: "support_ai_escalate",
    target_type: "support_ai_session",
    details: {
      chat_id: chatId,
      reason: args.reason ?? null,
      category: args.category ?? null,
    },
  });

  return { escalated: true };
}

export async function tagAsTestimonial(
  areaId: string,
  chatId: string,
): Promise<Record<string, unknown>> {
  const integration = await getUmblerIntegration(areaId);
  if (!integration) return { tagged: false, reason: "sem integração Umbler ativa" };

  const result = await addChatTag(integration, chatId, TESTIMONIAL_TAG_ID);
  if (!result.ok) return { tagged: false, reason: result.error };

  return { tagged: true };
}
