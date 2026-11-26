import "server-only";

/**
 * Envio de e-mail pelo Resend (reset de senha, convite e e-mails automáticos).
 * Env: RESEND_API_KEY e EMAIL_FROM (ex.: "Painel <painel@seudominio.com>").
 * Sem a chave, registra no log e não envia (o painel continua funcionando).
 */

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Nome que aparece no remetente; o endereço continua o do EMAIL_FROM. */
  fromName?: string | null;
  replyTo?: string | null;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Só o endereço do EMAIL_FROM ("Nome <a@b.com>" → "a@b.com"). */
export function senderAddress(): string | null {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) return null;
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

function buildFrom(fromName: string | null | undefined): string | null {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) return null;
  const name = fromName?.replace(/["<>\r\n]/g, "").trim();
  if (!name) return from;
  return `${name} <${senderAddress()}>`;
}

/** Envia e devolve o id do Resend. Lança em falha (quem chama decide o que fazer). */
export async function sendEmail(input: EmailInput): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = buildFrom(input.fromName);
  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY/EMAIL_FROM ausentes — e-mail não enviado:", input.subject);
    return null;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  return data?.id ?? null;
}

/** Base pública da instância para links de e-mail (nunca dos headers da request). */
export function siteUrl(): string {
  // SITE_URL é lido em runtime (secret do Worker); NEXT_PUBLIC_* é embutido no build.
  const configured = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}
