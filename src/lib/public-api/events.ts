import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de saída da API pública: quando algo acontece num disparo, o painel
 * faz POST na URL do cliente com um envelope fixo, assinado com HMAC-SHA256.
 *
 * - `createEmitter` só GRAVA a entrega (api_webhook_deliveries) — nunca chama
 *   a URL do cliente no meio do envio de mensagens.
 * - `deliverPending` envia o que está pendente (cron a cada minuto + logo
 *   após as ações da API). Falhou? Reentrega em 30s, 2min, 10min e 1h; depois
 *   desiste. 3 entregas esgotadas seguidas desligam o webhook.
 *
 * Nada aqui lança: webhook com problema jamais trava a fila de disparos.
 */

export const WEBHOOK_EVENTS = [
  { id: "message.sent", label: "Mensagem aceita pela Meta (tem message_id)." },
  { id: "message.failed", label: "A Meta recusou a mensagem (motivo em error)." },
  { id: "message.skipped", label: "Mensagem não enviada: número bloqueado, mesmo template nas últimas 24h, venda mudou ou campanha cancelada." },
  { id: "campaign.finished", label: "Todas as mensagens de uma campanha criada pela API saíram da fila." },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"] | "webhook.test";
export const WEBHOOK_EVENT_IDS: string[] = WEBHOOK_EVENTS.map((e) => e.id);

/** Atraso antes da 2ª, 3ª, 4ª e 5ª tentativa (segundos). */
export const RETRY_DELAYS_S = [30, 120, 600, 3600];
const MAX_ATTEMPTS = RETRY_DELAYS_S.length + 1;
const DISABLE_AFTER = 3;
const TIMEOUT_MS = 10_000;

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** v1 = HMAC-SHA256 hex de `${timestamp}.${corpo_bruto}` com o segredo do webhook. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/* ------------------------------------------------------- validação de URL */

function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/**
 * Só aceita https público: sem localhost, IP interno ou credencial na URL
 * (impede usar o painel para alcançar a rede interna). Revalidada a cada
 * entrega, porque o DNS pode mudar depois de salva.
 */
export async function validateWebhookUrl(raw: string): Promise<{ url: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "URL inválida." };
  }
  if (url.protocol !== "https:") return { error: "A URL do webhook precisa começar com https://." };
  if (url.username || url.password) return { error: "A URL não pode conter usuário ou senha." };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { error: "A URL precisa ser pública." };
  }

  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return { error: `Não encontrei o endereço "${host}".` };
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    return { error: "A URL aponta para um endereço interno — use um endereço público." };
  }
  return { url: url.toString() };
}

/* ---------------------------------------------------------------- emissão */

type WebhookConfig = { url: string | null; events: string[]; enabled: boolean };

/**
 * Emissor com cache da configuração por área (a fila processa dezenas de
 * linhas de uma vez). Devolve true se a entrega foi gravada.
 */
export function createEmitter() {
  const admin = createAdminClient();
  const configs = new Map<string, WebhookConfig | null>();

  return async function emit(areaId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<boolean> {
    try {
      if (!configs.has(areaId)) {
        const { data: row } = await admin
          .from("api_credentials")
          .select("webhook_url, webhook_events, webhook_enabled")
          .eq("area_id", areaId)
          .maybeSingle();
        configs.set(
          areaId,
          row
            ? {
                url: (row.webhook_url as string | null) ?? null,
                events: (row.webhook_events as string[]) ?? [],
                enabled: row.webhook_enabled !== false,
              }
            : null,
        );
      }
      const config = configs.get(areaId);
      if (!config?.url || !config.enabled) return false;
      if (event !== "webhook.test" && !config.events.includes(event)) return false;

      const id = randomUUID();
      const envelope = {
        delivery_id: id,
        event_id: typeof data.id === "string" ? `${event}:${data.id}` : id,
        version: "1",
        event,
        area_id: areaId,
        created_at: new Date().toISOString(),
        data,
      };
      const { error } = await admin
        .from("api_webhook_deliveries")
        .insert({ id, area_id: areaId, event, payload: envelope });
      if (error) {
        console.error("[public-api] falha ao gravar entrega:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[public-api] emit:", err);
      return false;
    }
  };
}

/** Dados enviados em message.* — a mesma forma de GET /messages/{id}. */
export function messagePayload(row: {
  id: string;
  telefone: string;
  template_name: string;
  template_language: string;
  trigger: string;
  source_ref?: string | null;
  campaign_id?: string | null;
  status: string;
  error?: string | null;
  wamid?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    message_id: row.wamid ?? null,
    number: row.telefone,
    template: row.template_name,
    language: row.template_language,
    status: row.status,
    error: row.error ?? null,
    campaign_id: row.campaign_id ?? null,
    source: row.source_ref === "api" ? "api" : row.trigger === "manual" ? "painel" : "regra",
    trigger: row.trigger,
    scheduled_at: row.scheduled_at ?? null,
    sent_at: row.sent_at ?? null,
  };
}

/* ---------------------------------------------------------------- entrega */

type SendOutcome = { ok: boolean; status: number | null; error: string | null };

async function post(url: string, secret: string, payload: Record<string, unknown>): Promise<SendOutcome> {
  const checked = await validateWebhookUrl(url);
  if ("error" in checked) return { ok: false, status: null, error: checked.error };

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(checked.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Dash-Webhooks/1",
        "X-Dash-Id": String(payload.delivery_id),
        "X-Dash-Event": String(payload.event),
        "X-Dash-Timestamp": String(timestamp),
        "X-Dash-Signature": `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status, error: null };
    return { ok: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? `sem resposta em ${TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : "falha na requisição";
    return { ok: false, status: null, error: message };
  }
}

type Target = { url: string; secret: string } | null;

async function loadTarget(areaId: string): Promise<Target> {
  const { data } = await createAdminClient()
    .from("api_credentials")
    .select("webhook_url, webhook_secret, webhook_enabled")
    .eq("area_id", areaId)
    .maybeSingle();
  if (!data?.webhook_url || !data.webhook_secret || data.webhook_enabled === false) return null;
  try {
    return { url: data.webhook_url as string, secret: await decryptSecret(data.webhook_secret as string) };
  } catch (err) {
    console.error("[public-api] falha ao decifrar segredo do webhook:", err);
    return null;
  }
}

/** Envia as entregas pendentes que já venceram. */
export async function deliverPending(options: { areaId?: string; limit?: number; maxMs?: number } = {}): Promise<{
  delivered: number;
  failed: number;
  retrying: number;
}> {
  const summary = { delivered: 0, failed: 0, retrying: 0 };
  const deadline = Date.now() + (options.maxMs ?? 45_000);

  try {
    const admin = createAdminClient();
    let query = admin
      .from("api_webhook_deliveries")
      .select("id, area_id, payload, attempts")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(options.limit ?? 100);
    if (options.areaId) query = query.eq("area_id", options.areaId);
    const { data: rows } = await query;

    const targets = new Map<string, Target>();

    for (const row of rows ?? []) {
      if (Date.now() > deadline) break;
      const attempts = (row.attempts as number) + 1;

      // Claim: empurra a próxima tentativa para frente; duas execuções
      // simultâneas nunca entregam a mesma linha ao mesmo tempo.
      const { data: claimed } = await admin
        .from("api_webhook_deliveries")
        .update({ attempts, next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
        .eq("attempts", row.attempts)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const areaId = row.area_id as string;
      if (!targets.has(areaId)) targets.set(areaId, await loadTarget(areaId));
      const target = targets.get(areaId);

      if (!target) {
        await admin
          .from("api_webhook_deliveries")
          .update({ status: "failed", last_error: "Webhook desativado ou sem URL." })
          .eq("id", row.id);
        summary.failed += 1;
        continue;
      }

      const outcome = await post(target.url, target.secret, row.payload as Record<string, unknown>);

      if (outcome.ok) {
        await admin
          .from("api_webhook_deliveries")
          .update({ status: "delivered", delivered_at: new Date().toISOString(), last_status: outcome.status, last_error: null })
          .eq("id", row.id);
        await admin.from("api_credentials").update({ webhook_failures: 0 }).eq("area_id", areaId).gt("webhook_failures", 0);
        summary.delivered += 1;
        continue;
      }

      if (attempts < MAX_ATTEMPTS) {
        await admin
          .from("api_webhook_deliveries")
          .update({
            last_status: outcome.status,
            last_error: outcome.error,
            next_attempt_at: new Date(Date.now() + RETRY_DELAYS_S[attempts - 1] * 1000).toISOString(),
          })
          .eq("id", row.id);
        summary.retrying += 1;
        continue;
      }

      await admin
        .from("api_webhook_deliveries")
        .update({ status: "failed", last_status: outcome.status, last_error: outcome.error })
        .eq("id", row.id);
      summary.failed += 1;

      const { data: cred } = await admin.from("api_credentials").select("webhook_failures").eq("area_id", areaId).maybeSingle();
      const failures = ((cred?.webhook_failures as number) ?? 0) + 1;
      await admin
        .from("api_credentials")
        .update({ webhook_failures: failures, ...(failures >= DISABLE_AFTER ? { webhook_enabled: false } : {}) })
        .eq("area_id", areaId);
      if (failures >= DISABLE_AFTER) {
        targets.set(areaId, null);
        console.warn("[public-api] webhook desligado após falhas seguidas na área", areaId);
      }
    }
  } catch (err) {
    console.error("[public-api] deliverPending:", err);
  }

  return summary;
}

/** Evento de teste: entrega na hora, uma tentativa, sem contar como falha do webhook. */
export async function sendTestEvent(areaId: string): Promise<SendOutcome & { delivery_id: string | null }> {
  const target = await loadTarget(areaId);
  if (!target) return { ok: false, status: null, error: "Configure a URL do webhook (e deixe-o ligado) antes de testar.", delivery_id: null };

  const id = randomUUID();
  const payload = {
    delivery_id: id,
    event_id: id,
    version: "1",
    event: "webhook.test",
    area_id: areaId,
    created_at: new Date().toISOString(),
    data: { message: "Evento de teste do painel. Se você recebeu isto, o webhook está funcionando." },
  };
  const outcome = await post(target.url, target.secret, payload);
  await createAdminClient()
    .from("api_webhook_deliveries")
    .insert({
      id,
      area_id: areaId,
      event: "webhook.test",
      payload,
      status: outcome.ok ? "delivered" : "failed",
      attempts: 1,
      last_status: outcome.status,
      last_error: outcome.error,
      delivered_at: outcome.ok ? new Date().toISOString() : null,
    });
  return { ...outcome, delivery_id: id };
}
