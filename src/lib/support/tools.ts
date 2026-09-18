import "server-only";

import { checkAccess } from "@/lib/lovable/client";
import { createAdminClient } from "@/lib/supabase/admin";

import type { GeminiTool } from "./gemini";

/** 8-11 dígitos finais — mesma normalização já usada pro match visitante/compra. */
function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

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
export const SUPPORT_TOOLS: GeminiTool[] = [
  {
    name: "lookup_purchase_status",
    description:
      "Consulta a compra mais recente de um cliente pelo telefone de contato do WhatsApp. Use sempre que o cliente perguntar sobre status de pedido, pagamento, acesso ou reembolso — nunca invente um status sem chamar essa ferramenta.",
    parameters: {
      type: "OBJECT",
      properties: {
        phone: {
          type: "STRING",
          description: "Telefone do cliente, em qualquer formato (com ou sem DDI/DDD).",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "lookup_access_status",
    description:
      "Verifica se um e-mail tem acesso ativo à plataforma do Programa Active. Use quando o cliente disser que está sem acesso, não consegue entrar/logar, ou perguntar se o acesso já foi liberado. Telefone do WhatsApp NÃO serve aqui — se ainda não tiver o e-mail do cliente na conversa, peça antes de chamar essa ferramenta.",
    parameters: {
      type: "OBJECT",
      properties: {
        email: {
          type: "STRING",
          description: "E-mail do cliente cadastrado na plataforma.",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Transfere a conversa para um atendente humano e avisa a equipe. Use sempre que o cliente pedir reembolso/estorno, fizer uma reclamação, pedir para falar com uma pessoa, ou quando você não tiver certeza de como ajudar.",
    parameters: {
      type: "OBJECT",
      properties: {
        reason: {
          type: "STRING",
          description: "Resumo curto do motivo do escalonamento, para o atendente humano.",
        },
      },
      required: ["reason"],
    },
  },
];

export async function lookupPurchaseStatus(
  areaId: string,
  args: { phone?: string },
): Promise<Record<string, unknown>> {
  const digits = phoneDigits(args.phone);
  if (!digits) return { found: false, error: "telefone inválido" };

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

export async function lookupAccessStatus(args: { email?: string }): Promise<Record<string, unknown>> {
  const email = args.email?.trim();
  if (!email) return { error: "e-mail inválido" };

  const result = await checkAccess(email);
  if ("error" in result) return { error: result.error };
  if (!result.found) return { found: false };
  return { found: true, has_access: result.hasAccess, email: result.email };
}

export async function escalateToHuman(
  areaId: string,
  chatId: string,
  args: { reason?: string },
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
    details: { chat_id: chatId, reason: args.reason ?? null },
  });

  return { escalated: true };
}
