/**
 * Acesso centralizado a variáveis de ambiente (só INFRA vive em env).
 *
 * Públicas (client-safe, prefixo NEXT_PUBLIC_): URL + chave anon/publishable do Supabase.
 * Privadas (server-only): SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY, SETUP_TOKEN.
 *
 * Credenciais de integração (Meta, Hotmart, Kiwify) e branding NÃO ficam em env —
 * vêm do painel (cifradas no banco). Ver CLAUDE.md.
 */

/** URL do projeto Supabase (client-safe). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Chave anon (ou a nova "publishable") do Supabase (client-safe). */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Veja .env.example.`,
    );
  }
  return value;
}

/** Chave service_role (ou a nova "secret") — SOMENTE no servidor. */
export const getServiceRoleKey = () =>
  requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");

/** Chave de criptografia dos segredos (pgcrypto) — SOMENTE no servidor. */
export const getEncryptionKey = () => requireServerEnv("ENCRYPTION_KEY");

/** Token que protege a rota /setup de primeira execução — SOMENTE no servidor. */
export const getSetupToken = () => requireServerEnv("SETUP_TOKEN");
