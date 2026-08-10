/**
 * Formatação de números/moeda. A moeda padrão vem das settings da área
 * (configurável pelo painel) — nada de valores fixos de instância aqui.
 */

const LOCALE = "pt-BR";

export function formatCurrency(value: number, currency = "BRL"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

/** ROAS no formato "N.NNx". */
export function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`;
}

/**
 * Sinaliza quando um rótulo (conta/campanha da Meta) é de moeda estrangeira —
 * os relatórios (semanal e checkpoint diário) NÃO convertem câmbio, então
 * spend/receita ficam na moeda da própria conta. Sem isso, um valor em
 * dólar apareceria rotulado como se fosse real. BRL/nulo não ganham
 * sufixo — só o que precisa do aviso.
 */
export function withCurrencyTag(label: string, currency: string | null): string {
  if (!currency || currency.toUpperCase() === "BRL") return label;
  return `${label} (${currency.toUpperCase()})`;
}

/** Mascara e-mail para exibição (LGPD): "jo***@dominio.com". */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return "—";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

/** Mascara telefone para exibição (LGPD): mantém só os 4 últimos dígitos. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}
