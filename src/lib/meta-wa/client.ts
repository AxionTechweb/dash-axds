import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE } from "@/lib/meta/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cliente da WhatsApp Cloud API (API OFICIAL da Meta) — mesmo espírito dos
 * outros clientes: nunca lança, sempre devolve erro estruturado.
 *
 * - Envio:      POST {GRAPH}/{phone_number_id}/messages  (type: "template")
 * - Templates:  GET  {GRAPH}/{waba_id}/message_templates
 * - Validação:  GET  {GRAPH}/{phone_number_id}
 *
 * Fora da janela de 24h só template APROVADO pode ser enviado.
 */

export type MetaWaIntegration = {
  areaId: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
};

/** Credencial da área, com o token já decifrado. SOMENTE no servidor. */
export async function getMetaWaIntegration(
  areaId: string,
): Promise<MetaWaIntegration | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("meta_wa_integrations")
    .select("access_token, waba_id, phone_number_id, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.access_token) return null;

  try {
    return {
      areaId,
      accessToken: await decryptSecret(data.access_token),
      wabaId: data.waba_id as string,
      phoneNumberId: data.phone_number_id as string,
    };
  } catch (err) {
    console.error("[meta-wa] falha ao decifrar access_token:", err);
    return null;
  }
}

/**
 * Normaliza um telefone para o formato da Cloud API (só dígitos, com DDI).
 * 10–11 dígitos = número brasileiro sem DDI → prefixa 55. Devolve null quando
 * não dá pra confiar no número.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15) return null;
  return digits;
}

type GraphError = { error?: { message?: string; code?: number; error_user_msg?: string } };

function graphMessage(body: GraphError | null, status: number): string {
  return body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${status}`;
}

export type SendResult =
  | { ok: true; wamid: string | null }
  | { ok: false; error: string };

/** Envia um template aprovado. `params` são as variáveis do corpo, em ordem. */
export async function sendMetaTemplate(
  integration: Pick<MetaWaIntegration, "accessToken" | "phoneNumberId">,
  to: string,
  templateName: string,
  language: string,
  params: string[],
): Promise<SendResult> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  };
  if (params.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: params.map((text) => ({ type: "text", text })),
      },
    ];
  }

  try {
    const response = await fetch(`${META_GRAPH_BASE}/${integration.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template,
      }),
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | (GraphError & { messages?: { id?: string }[] })
      | null;

    if (!response.ok) return { ok: false, error: graphMessage(body, response.status) };
    return { ok: true, wamid: body?.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha na requisição" };
  }
}

export type MetaWaTemplate = {
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | …
  category: string;
  /** Texto do BODY, com {{1}}, {{2}}… */
  body: string;
  /** Quantidade de variáveis do corpo. */
  paramCount: number;
};

type RawTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: { type?: string; text?: string }[];
};

export async function listMetaTemplates(
  integration: Pick<MetaWaIntegration, "accessToken" | "wabaId">,
): Promise<{ templates: MetaWaTemplate[]; error: string | null }> {
  const templates: MetaWaTemplate[] = [];
  let url: string | null =
    `${META_GRAPH_BASE}/${integration.wabaId}/message_templates?fields=name,language,status,category,components&limit=100`;

  try {
    // Paginação por cursor, com teto de segurança.
    for (let page = 0; url && page < 10; page += 1) {
      const response: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${integration.accessToken}` },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | (GraphError & { data?: RawTemplate[]; paging?: { next?: string } })
        | null;

      if (!response.ok) {
        return { templates, error: graphMessage(body, response.status) };
      }

      for (const raw of body?.data ?? []) {
        if (!raw.name) continue;
        const bodyText = raw.components?.find((c) => c.type === "BODY")?.text ?? "";
        templates.push({
          name: raw.name,
          language: raw.language ?? "pt_BR",
          status: raw.status ?? "UNKNOWN",
          category: raw.category ?? "",
          body: bodyText,
          paramCount: new Set(bodyText.match(/\{\{\d+\}\}/g) ?? []).size,
        });
      }
      url = body?.paging?.next ?? null;
    }
    return { templates, error: null };
  } catch (err) {
    return {
      templates,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/** Valida token + número ANTES de cifrar/salvar. */
export async function testMetaWaConnection(
  accessToken: string,
  phoneNumberId: string,
): Promise<{ ok: true; displayPhone: string | null } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    const body = (await response.json().catch(() => null)) as
      | (GraphError & { display_phone_number?: string })
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: `${graphMessage(body, response.status)} — confira o token e o Phone Number ID.`,
      };
    }
    return { ok: true, displayPhone: body?.display_phone_number ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha na requisição" };
  }
}
