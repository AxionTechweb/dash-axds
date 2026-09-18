import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import { UMBLER_API_BASE, UMBLER_RATE_LIMIT } from "./config";

/**
 * Cliente de baixo nível da Umbler Talk — mesmo espírito de src/lib/meta/client.ts
 * e src/lib/vturb/client.ts: nunca lança, sempre devolve erro estruturado.
 */

export type UmblerIntegration = {
  areaId: string;
  apiToken: string;
  organizationId: string;
};

/** Credencial da área, com o token já decifrado. SOMENTE no servidor. */
export async function getUmblerIntegration(
  areaId: string,
): Promise<UmblerIntegration | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("umbler_integrations")
    .select("api_token, organization_id, enabled")
    .eq("area_id", areaId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data?.api_token) return null;

  try {
    const apiToken = await decryptSecret(data.api_token);
    return { areaId, apiToken, organizationId: data.organization_id as string };
  } catch (err) {
    console.error("[umbler] falha ao decifrar api_token:", err);
    return null;
  }
}

export type UmblerFetchResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera a janela de rate limit abrir em vez de desistir na hora — o sync
 * diário roda vários chats em paralelo contra a MESMA chave de área, e uma
 * rejeição imediata aqui vira uma contagem de template silenciosamente
 * incompleta (visto numa execução real: 130+ de 199 chats rejeitados).
 */
async function waitForRateLimit(areaId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const allowed = await rateLimit(
      `umbler:${areaId}`,
      UMBLER_RATE_LIMIT.max,
      UMBLER_RATE_LIMIT.windowSeconds,
    );
    if (allowed) return true;
    await sleep(150);
  }
  return false;
}

/** GET autenticado, com o organizationId sempre incluído. Nunca lança. */
export async function umblerGet<T>(
  integration: { areaId: string; apiToken: string; organizationId: string },
  path: string,
  params: Record<string, string> = {},
): Promise<UmblerFetchResult<T>> {
  const allowed = await waitForRateLimit(integration.areaId);
  if (!allowed) return { data: null, error: "rate limit interno atingido" };

  const qs = new URLSearchParams({ organizationId: integration.organizationId, ...params });

  try {
    const response = await fetch(`${UMBLER_API_BASE}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${integration.apiToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        title?: string;
      } | null;
      return {
        data: null,
        error: body?.message ?? body?.title ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/**
 * POST autenticado, com `organizationId` sempre incluído no corpo (diferente
 * do GET, que leva na query string — confirmado contra a doc real: o schema
 * de `POST /v1/messages/` exige `OrganizationId` como campo do body, não
 * query param). Nunca lança.
 */
export async function umblerPost<T>(
  integration: { areaId: string; apiToken: string; organizationId: string },
  path: string,
  body: Record<string, unknown>,
): Promise<UmblerFetchResult<T>> {
  const allowed = await waitForRateLimit(integration.areaId);
  if (!allowed) return { data: null, error: "rate limit interno atingido" };

  try {
    const response = await fetch(`${UMBLER_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ OrganizationId: integration.organizationId, ...body }),
      cache: "no-store",
    });

    if (!response.ok) {
      const responseBody = (await response.json().catch(() => null)) as {
        message?: string;
        title?: string;
      } | null;
      return {
        data: null,
        error: responseBody?.message ?? responseBody?.title ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json().catch(() => null)) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/**
 * Envia uma mensagem de texto livre num chat existente — mesmo endpoint que
 * um atendente humano usa, então a resposta da IA fica indistinguível de uma
 * resposta manual no app da Umbler. Validado: `POST /v1/messages/` aceita
 * `{OrganizationId, ChatId, Message}` como JSON.
 */
export async function sendUmblerMessage(
  integration: UmblerIntegration,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error: string | null }> {
  const result = await umblerPost(integration, "/v1/messages/", {
    ChatId: chatId,
    Message: text,
  });
  return { ok: result.error === null, error: result.error };
}

/**
 * NÃO existe registro de webhook por API — testado contra `POST /v1/webhooks/`
 * (mesmo schema documentado, `{name, url, channelIds, events}`) e a Umbler
 * devolve 400 com `{"request":["This action can only be performed from
 * within the UI"]}`. O cadastro do webhook (URL, evento "Message", canal)
 * precisa ser feito manualmente no painel web da Umbler Talk — não há como
 * automatizar esse passo específico.
 */

export type UmblerOrganization = { id: string; name: string };

export type DiscoverUmblerResult =
  | { ok: true; organizations: UmblerOrganization[] }
  | { ok: false; error: string };

/** Descoberta de organizações a partir do token — mesmo espírito de discoverAdAccounts. */
export async function discoverUmblerOrganizations(
  apiToken: string,
): Promise<DiscoverUmblerResult> {
  const clean = apiToken.trim();
  if (!clean) return { ok: false, error: "Informe o token." };

  try {
    const response = await fetch(`${UMBLER_API_BASE}/v1/members/me/`, {
      headers: { Authorization: `Bearer ${clean}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Token inválido (HTTP ${response.status}). Gere um novo em account.umbler.com.`,
      };
    }

    const data = (await response.json()) as {
      organizations?: { id?: string; name?: string }[];
    };

    const organizations = (data.organizations ?? [])
      .filter((o): o is { id: string; name: string } => Boolean(o.id && o.name))
      .map((o) => ({ id: o.id, name: o.name }));

    if (organizations.length === 0) {
      return { ok: false, error: "O token é válido, mas não está em nenhuma organização." };
    }

    return { ok: true, organizations };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}
