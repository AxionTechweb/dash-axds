import "server-only";

import { checkAccess, grantAccess } from "@/lib/lovable/client";
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
      "Consulta a compra mais recente do cliente. Já usa automaticamente o telefone do WhatsApp de onde ele está falando — NÃO peça o telefone ao cliente, você já sabe qual é. Use sempre que o cliente perguntar sobre status de pedido, pagamento, acesso ou reembolso — nunca invente um status sem chamar essa ferramenta.",
    parameters: {
      type: "OBJECT",
      properties: {},
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
    name: "grant_access",
    description:
      "Concede acesso à plataforma pra um cliente que pagou mas está sem acesso. SÓ chame depois de confirmar com lookup_purchase_status que existe uma compra aprovada — esta ferramenta confere isso de novo sozinha e recusa se não achar uma compra aprovada, então não adianta chamar sem verificar antes. Use quando lookup_access_status mostrar has_access false para um cliente com pagamento aprovado.",
    parameters: {
      type: "OBJECT",
      properties: {
        email: {
          type: "STRING",
          description: "E-mail do cliente cadastrado na plataforma, o mesmo já usado em lookup_access_status.",
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

export async function lookupAccessStatus(args: { email?: string }): Promise<Record<string, unknown>> {
  const email = args.email?.trim();
  if (!email) return { error: "e-mail inválido" };

  const result = await checkAccess(email);
  if ("error" in result) return { error: result.error };
  if (!result.found) return { found: false };
  return { found: true, has_access: result.hasAccess, email: result.email };
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
    if (digits && phoneDigits(row.telefone as string | null) === digits) return true;
    if (emailNorm && (row.email as string | null)?.trim().toLowerCase() === emailNorm) return true;
    return false;
  });

  return match ? { produto: match.produto as string, created_at: match.created_at as string } : null;
}

export async function grantAccessTool(
  areaId: string,
  contactPhone: string | null,
  args: { email?: string },
): Promise<Record<string, unknown>> {
  const email = args.email?.trim();
  if (!email) return { granted: false, reason: "e-mail inválido" };

  const purchase = await findApprovedPurchase(areaId, { phone: contactPhone, email });
  if (!purchase) {
    return {
      granted: false,
      reason: "nenhuma compra aprovada encontrada pra esse telefone/e-mail — não é seguro conceder acesso",
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
