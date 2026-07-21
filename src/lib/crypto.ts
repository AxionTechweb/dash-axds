import "server-only";

import { getEncryptionKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cifra/decifra de segredos de integração via pgcrypto (funções app_encrypt /
 * app_decrypt no banco). A chave (ENCRYPTION_KEY) vive só no env do servidor e
 * NUNCA é gravada no banco. Ciphertext armazenado como TEXT base64.
 *
 * Uso: Fase 4 (webhooks) e Fase 7 (config das integrações). SOMENTE no servidor.
 */

/** Cifra um valor em claro e retorna o ciphertext base64 para gravar no banco. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("app_encrypt", {
    plaintext,
    key: getEncryptionKey(),
  });
  if (error) throw error;
  return data as string;
}

/** Decifra um ciphertext base64 vindo do banco e retorna o valor em claro. */
export async function decryptSecret(ciphertext: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("app_decrypt", {
    ciphertext,
    key: getEncryptionKey(),
  });
  if (error) throw error;
  return data as string;
}
