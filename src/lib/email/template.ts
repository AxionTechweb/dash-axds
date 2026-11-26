/**
 * Modelo dos e-mails automáticos: variáveis {{nome}} etc., texto simples do
 * painel → HTML seguro. Sem `server-only`: a prévia da tela usa o mesmo código.
 */

export type EmailContext = {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  produto?: string | null;
  valor?: number | null;
  moeda?: string | null;
};

export type EmailTemplate = {
  subject: string;
  body: string;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
};

export const EMAIL_VARIABLES = [
  { id: "primeiro_nome", label: "Primeiro nome" },
  { id: "nome", label: "Nome completo" },
  { id: "email", label: "E-mail" },
  { id: "telefone", label: "Telefone" },
  { id: "produto", label: "Produto" },
  { id: "valor", label: "Valor" },
] as const;

export const SAMPLE_CONTEXT: EmailContext = {
  nome: "Fulano de Tal",
  email: "fulano@exemplo.com",
  telefone: "5511999998888",
  produto: "Produto de teste",
  valor: 97,
  moeda: "BRL",
};

export const DEFAULT_APPROVED_TEMPLATE: EmailTemplate = {
  subject: "Compra aprovada: {{produto}}",
  body:
    "Olá, {{primeiro_nome}}!\n\n" +
    "Sua compra de {{produto}} ({{valor}}) foi aprovada.\n\n" +
    "Qualquer dúvida, é só responder este e-mail.",
  buttonLabel: "",
  buttonUrl: "",
};

function cleanName(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[^\p{L}\s'.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function formatMoney(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
  } catch {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  }
}

export function variableValues(ctx: EmailContext): Record<string, string> {
  const nome = cleanName(ctx.nome);
  return {
    primeiro_nome: nome.split(/\s+/)[0] || "cliente",
    nome: nome || "cliente",
    email: ctx.email?.trim().slice(0, 120) || "",
    telefone: ctx.telefone?.replace(/[^\d+]/g, "").slice(0, 20) || "",
    produto: ctx.produto?.trim().slice(0, 120) || "seu pedido",
    valor: typeof ctx.valor === "number" ? formatMoney(ctx.valor, ctx.moeda || "BRL") : "",
  };
}

/** Troca {{variavel}} pelo valor; variável desconhecida fica vazia. */
export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Só http(s); qualquer outra coisa (javascript:, data:) é descartada. */
export function safeUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderEmail(template: EmailTemplate, ctx: EmailContext): RenderedEmail {
  const values = variableValues(ctx);
  const subject = fillVariables(template.subject, values).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const body = fillVariables(template.body, values).trim();
  const buttonUrl = safeUrl(template.buttonUrl ? fillVariables(template.buttonUrl, values) : null);
  const buttonLabel = template.buttonLabel?.trim() ? fillVariables(template.buttonLabel, values).trim() : "";

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const button =
    buttonUrl && buttonLabel
      ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:12px 22px;background:#111827;color:#ffffff;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(buttonLabel)}</a></p>`
      : "";

  const html =
    `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">` +
    paragraphs +
    button +
    `</div></body></html>`;

  const text = buttonUrl && buttonLabel ? `${body}\n\n${buttonLabel}: ${buttonUrl}` : body;
  return { subject, html, text };
}
