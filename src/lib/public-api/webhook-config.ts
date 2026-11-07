import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

import { newWebhookSecret, validateWebhookUrl, WEBHOOK_EVENT_IDS } from "./events";

/**
 * Leitura/gravação da configuração do webhook de uma área — usada pela API
 * (GET/PUT /api/v1/webhook) e pelo painel (Integrações → API pública).
 */

export type WebhookConfigView = {
  url: string | null;
  events: string[];
  enabled: boolean;
  secret: string | null;
  consecutive_failures: number;
};

export async function readWebhookConfig(areaId: string): Promise<WebhookConfigView | null> {
  const { data } = await createAdminClient()
    .from("api_credentials")
    .select("webhook_url, webhook_secret, webhook_events, webhook_enabled, webhook_failures")
    .eq("area_id", areaId)
    .maybeSingle();
  if (!data) return null;
  let secret: string | null = null;
  if (data.webhook_secret) {
    try {
      secret = await decryptSecret(data.webhook_secret as string);
    } catch {
      secret = null;
    }
  }
  return {
    url: (data.webhook_url as string | null) ?? null,
    events: (data.webhook_events as string[]) ?? [],
    enabled: data.webhook_enabled !== false,
    secret,
    consecutive_failures: (data.webhook_failures as number) ?? 0,
  };
}

/**
 * Atualiza a configuração. `url: null` remove o webhook. Gera o segredo de
 * assinatura na primeira URL (ou quando `rotateSecret`). Salvar religa o
 * webhook e zera o contador de falhas.
 */
export async function saveWebhookConfig(
  areaId: string,
  input: { url?: string | null; events?: unknown; enabled?: boolean; rotateSecret?: boolean },
): Promise<{ ok: true; config: WebhookConfigView } | { ok: false; error: string; code: string }> {
  const current = await readWebhookConfig(areaId);
  if (!current) return { ok: false, code: "no_credentials", error: "Gere as credenciais da API antes de configurar o webhook." };

  const patch: Record<string, unknown> = { webhook_failures: 0 };

  if (input.url !== undefined) {
    if (input.url === null || input.url === "") {
      patch.webhook_url = null;
    } else {
      const checked = await validateWebhookUrl(input.url);
      if ("error" in checked) return { ok: false, code: "invalid_url", error: checked.error };
      patch.webhook_url = checked.url;
    }
  }

  if (input.events !== undefined) {
    if (!Array.isArray(input.events) || input.events.some((e) => !WEBHOOK_EVENT_IDS.includes(String(e)))) {
      return { ok: false, code: "invalid_events", error: `\`events\` aceita: ${WEBHOOK_EVENT_IDS.join(", ")}.` };
    }
    patch.webhook_events = [...new Set(input.events.map(String))];
  }

  patch.webhook_enabled = input.enabled ?? true;

  const willHaveUrl = patch.webhook_url !== undefined ? patch.webhook_url !== null : current.url !== null;
  if (willHaveUrl && (!current.secret || input.rotateSecret)) {
    patch.webhook_secret = await encryptSecret(newWebhookSecret());
  }

  const { error } = await createAdminClient().from("api_credentials").update(patch).eq("area_id", areaId);
  if (error) return { ok: false, code: "internal_error", error: "Não consegui salvar o webhook." };

  const config = await readWebhookConfig(areaId);
  return config ? { ok: true, config } : { ok: false, code: "internal_error", error: "Não consegui ler o webhook salvo." };
}
