import "server-only";

import { getAdAccounts } from "./client";
import { META_GRAPH_BASE } from "./config";

/**
 * ESCRITA de GESTÃO na Marketing API (status e orçamento das campanhas).
 * Exige token com escopo `ads_management`.
 *
 * Este módulo NUNCA envia eventos de conversão — só gerencia entidades.
 * Toda chamada aqui deve vir de uma Server Action que já checou a sessão,
 * confirmou com o usuário e registra em audit_log.
 */

export type WriteResult = { ok: boolean; error?: string };

async function tokenForAccount(
  areaId: string,
  accountId: string,
): Promise<string | null> {
  const accounts = await getAdAccounts(areaId);
  return accounts.find((a) => a.id === accountId)?.ads_token ?? null;
}

async function postToMeta(
  entityId: string,
  token: string,
  fields: Record<string, string>,
): Promise<WriteResult> {
  const body = new URLSearchParams({ ...fields, access_token: token });

  try {
    const response = await fetch(`${META_GRAPH_BASE}/${entityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        ok: false,
        error: payload?.error?.message ?? `HTTP ${response.status}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/** Ativa ou pausa uma campanha, conjunto ou anúncio. */
export async function updateEntityStatus(
  areaId: string,
  accountId: string,
  entityId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<WriteResult> {
  const token = await tokenForAccount(areaId, accountId);
  if (!token) return { ok: false, error: "Token da conta não configurado." };

  return postToMeta(entityId, token, { status });
}

/**
 * Atualiza o orçamento. A Meta trabalha em CENTAVOS, então o valor em unidade
 * de moeda é convertido aqui.
 */
export async function updateEntityBudget(
  areaId: string,
  accountId: string,
  entityId: string,
  budgetType: "daily" | "lifetime",
  amount: number,
): Promise<WriteResult> {
  const token = await tokenForAccount(areaId, accountId);
  if (!token) return { ok: false, error: "Token da conta não configurado." };

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Orçamento inválido." };
  }

  const cents = String(Math.round(amount * 100));
  const field = budgetType === "daily" ? "daily_budget" : "lifetime_budget";

  return postToMeta(entityId, token, { [field]: cents });
}
