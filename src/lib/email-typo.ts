/**
 * Detecção de erro de digitação no DOMÍNIO de um e-mail — compartilhada entre
 * o agente de suporte (src/lib/support/tools.ts, que só SUGERE e espera o
 * cliente confirmar) e a correção automática no webhook de compra
 * (src/app/api/webhook/[plataforma]/route.ts, que aplica sozinho). Função
 * pura, sem "server-only": só string, nenhuma chamada externa.
 */

// Provedores comuns no Brasil — base pra detectar erro de digitação no
// domínio (ex.: "hotmali.com" em vez de "hotmail.com"). Só entra na lista de
// sugestão quando o domínio digitado NÃO é um desses (evita "corrigir" um
// domínio raro só por ser parecido).
export const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "live.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "globo.com",
  "msn.com",
];

export function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Sugere a correção de domínio quando o e-mail digitado está perto (distância
 * de edição <= 2) de um provedor comum, mas não é exatamente igual a nenhum
 * deles — ex.: "malbaregina@hotmali.com" -> domínio "hotmali.com" tem
 * distância 1 de "hotmail.com", vira sugestão. Nunca toca na parte antes do
 * "@". Devolve `null` quando não há "@", domínio vazio, domínio já é um dos
 * comuns, ou nenhum candidato fica a distância <= 2.
 */
export function suggestEmailTypoFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_EMAIL_DOMAINS.includes(domain)) return null;

  let best: { domain: string; dist: number } | null = null;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const dist = levenshtein(domain, candidate);
    if (dist <= 2 && (!best || dist < best.dist))
      best = { domain: candidate, dist };
  }
  return best ? `${local}@${best.domain}` : null;
}
