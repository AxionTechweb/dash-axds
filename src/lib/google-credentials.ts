import "server-only";

/**
 * Credencial de Service Account colada no painel (Sheets/GA4).
 *
 * O google-auth-library aceita vários tipos de JSON — inclusive
 * "external_account", que manda o servidor LER ARQUIVOS locais ou buscar URLs
 * arbitrárias e enviar o conteúdo para um token_url qualquer. Por isso só
 * repassamos os campos de uma service account de verdade, nada mais.
 */
export type ServiceAccountCredentials = {
  type: "service_account";
  client_email: string;
  private_key: string;
  project_id?: string;
};

export function parseServiceAccount(json: string): ServiceAccountCredentials {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw?.type !== "service_account") {
    throw new Error('A chave precisa ser de uma Service Account (type "service_account").');
  }
  const clientEmail = raw.client_email;
  const privateKey = raw.private_key;
  if (typeof clientEmail !== "string" || !clientEmail.endsWith(".gserviceaccount.com")) {
    throw new Error("client_email inválido na chave da Service Account.");
  }
  if (typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("private_key ausente na chave da Service Account.");
  }
  return {
    type: "service_account",
    client_email: clientEmail,
    private_key: privateKey,
    ...(typeof raw.project_id === "string" ? { project_id: raw.project_id } : {}),
  };
}
