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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
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
