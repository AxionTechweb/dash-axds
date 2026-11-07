import "server-only";

import { getMetaWaIntegration, type MetaWaIntegration } from "@/lib/meta-wa/client";

import { apiError } from "./auth";

/** Máximo de mensagens por campanha (o mesmo do painel). */
export const MAX_CAMPAIGN = 500;
/** Máximo de variáveis por template. */
export const MAX_PARAMS = 10;
/** Agendamento máximo à frente. */
const MAX_SCHEDULE_DAYS = 30;

const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2}(_[A-Z]{2})?$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `template` + `language` (padrão pt_BR). */
export function parseTemplateRef(body: Record<string, unknown>): { name: string; language: string } | Response {
  const name = typeof body.template === "string" ? body.template.trim() : "";
  const language = typeof body.language === "string" && body.language.trim() ? body.language.trim() : "pt_BR";
  if (!TEMPLATE_RE.test(name)) {
    return apiError(422, "invalid_template", "Informe `template` com o nome exato do template aprovado (minúsculas, números e _).");
  }
  if (!LANGUAGE_RE.test(language)) {
    return apiError(422, "invalid_language", "`language` inválido. Use o código do template, ex.: pt_BR, en_US, es.");
  }
  return { name, language };
}

/** A Meta rejeita variável vazia, com quebra de linha ou 4+ espaços seguidos. */
function cleanParam(raw: unknown): string {
  const value = String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1024);
  return value || "-";
}

/** `params`: array de textos, na ordem {{1}}, {{2}}… */
export function parseParams(raw: unknown, field = "params"): string[] | Response {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v === "object" && v !== null)) {
    return apiError(422, "invalid_params", `\`${field}\` precisa ser um array de textos, na ordem das variáveis {{1}}, {{2}}…`);
  }
  if (raw.length > MAX_PARAMS) return apiError(422, "invalid_params", `No máximo ${MAX_PARAMS} variáveis.`);
  return raw.map(cleanParam);
}

/**
 * `scheduled_for`: data ISO 8601 ou timestamp em milissegundos. Vazio ou no
 * passado = agora. Devolve o instante em ISO.
 */
export function parseSchedule(raw: unknown): string | Response {
  if (raw === undefined || raw === null || raw === "") return new Date().toISOString();
  const time = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(time)) {
    return apiError(422, "invalid_schedule", "`scheduled_for` precisa ser uma data ISO 8601 (ex.: 2026-11-10T14:00:00-03:00) ou timestamp em ms.");
  }
  if (time > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) {
    return apiError(422, "invalid_schedule", `Agendamento de no máximo ${MAX_SCHEDULE_DAYS} dias à frente.`);
  }
  return new Date(Math.max(time, Date.now())).toISOString();
}

/** Integração da API oficial da área, ou o erro 409 pronto. */
export async function requireIntegration(areaId: string): Promise<MetaWaIntegration | Response> {
  const integration = await getMetaWaIntegration(areaId);
  if (!integration) {
    return apiError(409, "whatsapp_not_connected", "A API oficial do WhatsApp não está conectada nesta área (painel → Integrações).");
  }
  return integration;
}
