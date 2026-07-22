import "server-only";

import { META_GRAPH_BASE } from "./config";
import { normalizeAccountId } from "./client";

/**
 * "Testar conexão" da tela de Integrações.
 *
 * Valida, ANTES de salvar:
 *  1. o token funciona;
 *  2. tem os escopos ads_read e ads_management (necessários para ler insights
 *     e para a edição inline de status/orçamento);
 *  3. o token realmente enxerga a conta de anúncio informada.
 */
export type ConnectionTest = {
  ok: boolean;
  accountName?: string;
  accountCurrency?: string;
  scopes?: string[];
  missingScopes?: string[];
  error?: string;
};

const REQUIRED_SCOPES = ["ads_read", "ads_management"];

export async function testAdAccountConnection(
  token: string,
  adAccountId: string,
): Promise<ConnectionTest> {
  try {
    // 1 + 2. Escopos concedidos ao token.
    const permsResponse = await fetch(
      `${META_GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );

    if (!permsResponse.ok) {
      const body = (await permsResponse.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        ok: false,
        error: body?.error?.message ?? `Token inválido (HTTP ${permsResponse.status})`,
      };
    }

    const perms = (await permsResponse.json()) as {
      data?: { permission: string; status: string }[];
    };

    const granted = (perms.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);

    const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));

    // 3. O token enxerga a conta informada?
    const accountResponse = await fetch(
      `${META_GRAPH_BASE}/${normalizeAccountId(adAccountId)}?fields=name,currency,account_status&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );

    if (!accountResponse.ok) {
      const body = (await accountResponse.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        ok: false,
        scopes: granted,
        missingScopes: missing,
        error:
          body?.error?.message ??
          `Conta de anúncio inacessível (HTTP ${accountResponse.status})`,
      };
    }

    const account = (await accountResponse.json()) as {
      name?: string;
      currency?: string;
    };

    return {
      ok: missing.length === 0,
      accountName: account.name,
      accountCurrency: account.currency,
      scopes: granted,
      missingScopes: missing,
      error:
        missing.length > 0
          ? `Faltam escopos: ${missing.join(", ")}. Gere um token de System User com ads_read e ads_management.`
          : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha na requisição",
    };
  }
}
