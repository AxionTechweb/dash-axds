import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envio de avisos por WhatsApp via Evolution API (self-hosted). Validado
 * contra uma instância real: `POST {baseUrl}/message/sendText/{instance}`,
 * header `apikey`, corpo `{ number, text }` — devolve 201 com a mensagem em
 * status PENDING.
 *
 * Nunca lança: uma falha no WhatsApp não pode derrubar o cron de alertas nem
 * o motor de Regras.
 */

export type WhatsappIntegration = {
  areaId: string;
  baseUrl: string;
  instance: string;
  apiKey: string;
  targetNumber: string;
};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Credencial da área, com a api_key já decifrada. SOMENTE no servidor. */
export async function getWhatsappIntegration(
  areaId: string,
): Promise<WhatsappIntegration | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_integrations")
    .select("base_url, instance, api_key, target_number, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.api_key) return null;

  try {
    const apiKey = await decryptSecret(data.api_key);
    return {
      areaId,
      baseUrl: normalizeBaseUrl(data.base_url as string),
      instance: data.instance as string,
      apiKey,
      targetNumber: data.target_number as string,
    };
  } catch (err) {
    console.error("[whatsapp] falha ao decifrar api_key:", err);
    return null;
  }
}

/** Testa a conexão (estado da instância) ANTES de cifrar/salvar. */
export async function testWhatsappConnection(
  baseUrl: string,
  instance: string,
  apiKey: string,
): Promise<{ ok: true; state: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${normalizeBaseUrl(baseUrl)}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: apiKey }, cache: "no-store" },
    );

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} — confira URL, instância e API key.` };
    }

    const body = (await res.json()) as { instance?: { state?: string } };
    const state = body.instance?.state ?? "desconhecido";
    if (state !== "open") {
      return {
        ok: false,
        error: `Instância encontrada, mas o WhatsApp não está conectado (estado: ${state}).`,
      };
    }

    return { ok: true, state };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/** Envia uma mensagem de texto. Nunca lança — erro vira `{ok:false}`. */
export async function sendWhatsappMessage(
  integration: WhatsappIntegration,
  text: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(
      `${integration.baseUrl}/message/sendText/${encodeURIComponent(integration.instance)}`,
      {
        method: "POST",
        headers: {
          apikey: integration.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: integration.targetNumber, text }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: body?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true, error: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/**
 * Ponto único usado pelo motor de alertas/Regras: busca a integração da área
 * e manda a mensagem. Se a área não tem WhatsApp conectado, é um no-op
 * silencioso — o resto do sistema não deve exigir WhatsApp pra funcionar.
 */
export async function notifyArea(areaId: string, text: string): Promise<void> {
  const integration = await getWhatsappIntegration(areaId);
  if (!integration) return;

  const result = await sendWhatsappMessage(integration, text);
  if (!result.ok) {
    console.error(`[whatsapp] falha ao enviar aviso (área ${areaId}):`, result.error);
  }
}
