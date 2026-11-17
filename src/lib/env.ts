/**
 * Acesso centralizado a variáveis de ambiente (só INFRA vive em env).
 *
 * Banco = Cloudflare D1 (binding `DB`, não é env). Privadas (server-only):
 * ENCRYPTION_KEY, SETUP_TOKEN, CRON_SECRET, RESEND_API_KEY, EMAIL_FROM.
 *
 * Credenciais de integração (Meta, Hotmart, Kiwify) e branding NÃO ficam em env —
 * vêm do painel (cifradas no banco). Ver CLAUDE.md.
 */

function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Veja .dev.vars.example.`,
    );
  }
  return value;
}

/** Chave de criptografia dos segredos (AES-GCM) — SOMENTE no servidor. */
export const getEncryptionKey = () => requireServerEnv("ENCRYPTION_KEY");

/** Token que protege a rota /setup de primeira execução — SOMENTE no servidor. */
export const getSetupToken = () => requireServerEnv("SETUP_TOKEN");
