import "server-only";

/**
 * Envio de e-mail transacional (reset de senha, convite) pelo Resend.
 * Env: RESEND_API_KEY e EMAIL_FROM (ex.: "Painel <painel@seudominio.com>").
 * Sem a chave, registra no log e não envia (o painel continua funcionando).
 */
export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY/EMAIL_FROM ausentes — e-mail não enviado:", input.subject);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Base pública da instância para links de e-mail (nunca dos headers da request). */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}
