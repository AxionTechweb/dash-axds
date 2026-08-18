import "server-only";

import { google } from "googleapis";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

import { GA4_API_BASE, GA4_SCOPE } from "./config";

/**
 * Autenticação com o GA4 Data API via Service Account do Google — mesma
 * técnica de src/lib/sheets/client.ts (google.auth.GoogleAuth, já
 * dependência do projeto). Pode ser a MESMA service account do Sheets,
 * desde que tenha a Analytics Data API ativada e acesso de Leitor à
 * propriedade GA4.
 */

export type Ga4Integration = {
  areaId: string;
  propertyId: string;
  accessToken: string;
};

function extractGoogleError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "falha desconhecida");
  }
  return "falha desconhecida";
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [GA4_SCOPE] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Não foi possível obter access token da service account.");
  return token;
}

/** Credencial da área, com access token já emitido. SOMENTE no servidor. */
export async function getGa4Integration(areaId: string): Promise<Ga4Integration | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ga4_integrations")
    .select("property_id, service_account_json, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.service_account_json || !data.property_id) return null;

  try {
    const json = await decryptSecret(data.service_account_json);
    const accessToken = await getAccessToken(json);
    return { areaId, propertyId: data.property_id, accessToken };
  } catch (err) {
    console.error("[ga4] falha ao autenticar:", err);
    return null;
  }
}

/**
 * Testa a credencial ANTES de salvar (botão "Testar conexão" no painel) —
 * pede a metadata da propriedade, chamada leve o bastante pra validar em
 * tempo de formulário.
 */
export async function testGa4Connection(
  propertyId: string,
  serviceAccountJson: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const accessToken = await getAccessToken(serviceAccountJson);
    const res = await fetch(`${GA4_API_BASE}/properties/${propertyId}/metadata`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: extractGoogleError(err) };
  }
}
