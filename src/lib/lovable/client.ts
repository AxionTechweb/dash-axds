import "server-only";

/**
 * Client fino pro app "Programa Active" (hospedado na Lovable Cloud, banco
 * separado deste projeto). Em vez de dar acesso direto ao Postgres de outro
 * sistema, o próprio app expõe uma Edge Function só de leitura, protegida por
 * um segredo compartilhado.
 *
 * Validado ao vivo antes de implementar: 401 com segredo errado,
 * `{found:false}` pra e-mail inexistente, `{found:true, has_access, email}`
 * pra e-mail cadastrado.
 */

const CHECK_ACCESS_URL = "https://programa-active.com/api/public/check-access";
const GRANT_ACCESS_URL = "https://programa-active.com/api/public/grant-access";

function authHeaders(secret: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
}

export type CheckAccessResult =
  | { found: true; hasAccess: boolean; email: string }
  | { found: false }
  | { error: string };

export async function checkAccess(email: string): Promise<CheckAccessResult> {
  const secret = process.env.LOVABLE_ACCESS_SHARED_SECRET;
  if (!secret) return { error: "LOVABLE_ACCESS_SHARED_SECRET não configurada" };

  try {
    const response = await fetch(CHECK_ACCESS_URL, {
      method: "POST",
      headers: authHeaders(secret),
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const data = (await response.json().catch(() => null)) as {
      found?: boolean;
      has_access?: boolean;
      email?: string;
    } | null;

    if (!data?.found) return { found: false };

    return {
      found: true,
      hasAccess: Boolean(data.has_access),
      email: data.email ?? email,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

export type GrantAccessResult =
  | { ok: true; alreadyHadAccess: boolean }
  | { ok: false; error: string };

/**
 * Concede acesso via a MESMA function que já roda automaticamente na
 * confirmação de pagamento (pedido explícito: reaproveitar aquela lógica, não
 * duplicar). Quem chama esta função é responsável por já ter confirmado que o
 * cliente pagou — este client não faz nenhuma verificação de negócio, só a
 * chamada HTTP.
 */
export async function grantAccess(email: string): Promise<GrantAccessResult> {
  const secret = process.env.LOVABLE_ACCESS_SHARED_SECRET;
  if (!secret) return { ok: false, error: "LOVABLE_ACCESS_SHARED_SECRET não configurada" };

  try {
    const response = await fetch(GRANT_ACCESS_URL, {
      method: "POST",
      headers: authHeaders(secret),
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      already_had_access?: boolean;
      error?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? `HTTP ${response.status}` };
    }

    return { ok: true, alreadyHadAccess: Boolean(data.already_had_access) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}
