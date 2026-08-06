import "server-only";

import { google, sheets_v4 } from "googleapis";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Autenticação com a Sheets API via Service Account do Google — não OAuth de
 * usuário, porque o cron roda sem sessão de ninguém. A chave JSON é colada no
 * painel (Integrações) e cifrada como qualquer outro segredo (app_encrypt).
 *
 * Setup único fora do código (documentado no README): criar a service
 * account no Google Cloud, ativar a Sheets API, e compartilhar a planilha de
 * destino com o `client_email` dela como Editor.
 */

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export type SheetsIntegration = {
  areaId: string;
  spreadsheetId: string;
  templateTabName: string;
  sheets: sheets_v4.Sheets;
};

function authFor(serviceAccountJson: string, scopes: string[]) {
  const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  return new google.auth.GoogleAuth({ credentials, scopes });
}

function extractGoogleError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "falha desconhecida");
  }
  return "falha desconhecida";
}

/** Credencial + cliente Sheets já autenticado da área. SOMENTE no servidor. */
export async function getSheetsIntegration(
  areaId: string,
): Promise<SheetsIntegration | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_sheets_integrations")
    .select("spreadsheet_id, service_account_json, template_tab_name, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.service_account_json || !data.spreadsheet_id) return null;

  try {
    const json = await decryptSecret(data.service_account_json);
    const auth = authFor(json, [SHEETS_SCOPE]);
    const sheets = google.sheets({ version: "v4", auth });

    return {
      areaId,
      spreadsheetId: data.spreadsheet_id,
      templateTabName: data.template_tab_name || "TEMPLATE",
      sheets,
    };
  } catch (err) {
    console.error("[sheets] falha ao autenticar:", err);
    return null;
  }
}

/**
 * Testa a credencial ANTES de salvar (botão "Testar conexão" no painel) —
 * só pede o título da planilha, chamada leve o bastante pra validar em
 * tempo de formulário.
 */
export async function testSheetsConnection(
  spreadsheetId: string,
  serviceAccountJson: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  try {
    const auth = authFor(serviceAccountJson, [SHEETS_READONLY_SCOPE]);
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title",
    });

    const title = res.data.properties?.title;
    if (!title) return { ok: false, error: "Planilha sem título — verifique o ID." };
    return { ok: true, title };
  } catch (err) {
    return { ok: false, error: extractGoogleError(err) };
  }
}
