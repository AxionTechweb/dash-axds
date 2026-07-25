import "server-only";

import type { DiscoveredAccount } from "./accounts";
import { META_GRAPH_BASE } from "./config";

/**
 * Descoberta de contas de anúncio a partir do TOKEN.
 *
 * Em vez de o usuário digitar o `act_<id>` na mão (e errar), ele cola o token
 * do System User uma vez e o painel lista tudo que aquele token enxerga. É a
 * mesma checagem de escopos do "Testar conexão", só que devolvendo o catálogo.
 *
 * Segurança: o token NUNCA volta para o cliente por aqui — esta função roda no
 * servidor (Server Action) e devolve apenas o catálogo de contas.
 *
 * Os tipos e o helper de rótulo vivem em `./accounts` (puro), porque a
 * interface também precisa deles.
 */

export type { DiscoveredAccount };

export type DiscoverResult =
  | { ok: true; accounts: DiscoveredAccount[]; scopes: string[] }
  | { ok: false; error: string; missingScopes?: string[] };

const REQUIRED_SCOPES = ["ads_read", "ads_management"];

type GraphError = { error?: { message?: string } };

export async function discoverAdAccounts(
  token: string,
): Promise<DiscoverResult> {
  const clean = token.trim();
  if (!clean) return { ok: false, error: "Informe o token." };

  try {
    // 1. Escopos concedidos — falha cedo com mensagem útil.
    const permsResponse = await fetch(
      `${META_GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(clean)}`,
      { cache: "no-store" },
    );

    if (!permsResponse.ok) {
      const body = (await permsResponse.json().catch(() => null)) as GraphError | null;
      return {
        ok: false,
        error:
          body?.error?.message ??
          `Token inválido ou expirado (HTTP ${permsResponse.status}).`,
      };
    }

    const perms = (await permsResponse.json()) as {
      data?: { permission: string; status: string }[];
    };
    const granted = (perms.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);
    const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));

    if (missing.length > 0) {
      return {
        ok: false,
        missingScopes: missing,
        error: `Faltam escopos no token: ${missing.join(", ")}. Gere um token de System User com ads_read e ads_management.`,
      };
    }

    // 2. Catálogo de contas. `limit=200` cobre com folga o caso normal; a
    //    paginação é seguida até o fim para não esconder conta de ninguém.
    const accounts: DiscoveredAccount[] = [];
    let url =
      `${META_GRAPH_BASE}/me/adaccounts` +
      `?fields=name,account_status,currency,business{name}` +
      `&limit=200&access_token=${encodeURIComponent(clean)}`;

    // Trava de segurança: no máximo 10 páginas (2000 contas).
    for (let page = 0; page < 10 && url; page += 1) {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as GraphError | null;
        return {
          ok: false,
          error:
            body?.error?.message ??
            `Não foi possível listar as contas (HTTP ${response.status}).`,
        };
      }

      const json = (await response.json()) as {
        data?: {
          id?: string;
          name?: string;
          currency?: string;
          account_status?: number;
          business?: { name?: string };
        }[];
        paging?: { next?: string };
      };

      for (const row of json.data ?? []) {
        if (!row.id) continue;
        accounts.push({
          id: row.id.startsWith("act_") ? row.id : `act_${row.id}`,
          name: row.name?.trim() || row.id,
          currency: row.currency ?? null,
          status: typeof row.account_status === "number" ? row.account_status : null,
          businessName: row.business?.name ?? null,
        });
      }

      url = json.paging?.next ?? "";
    }

    if (accounts.length === 0) {
      return {
        ok: false,
        error:
          "O token é válido, mas não enxerga nenhuma conta de anúncio. No Business Manager, vincule a conta ao System User em Adicionar ativos.",
      };
    }

    // Ativas primeiro, depois alfabética.
    accounts.sort((a, b) => {
      const activeA = a.status === 1 ? 0 : 1;
      const activeB = b.status === 1 ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    return { ok: true, accounts, scopes: granted };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha na requisição à Meta.",
    };
  }
}
