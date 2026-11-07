import { apiError, apiOk, authenticate, readJson } from "@/lib/public-api/auth";
import { readWebhookConfig, saveWebhookConfig } from "@/lib/public-api/webhook-config";

/**
 * GET /api/v1/webhook — URL, eventos e o segredo usado para assinar as entregas.
 * PUT /api/v1/webhook — { url, events?, enabled?, rotate_secret? }; url null remove.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const config = await readWebhookConfig(ctx.areaId);
  if (!config) return apiError(404, "not_found", "Credenciais da API não encontradas.");
  return apiOk(config);
}

export async function PUT(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  if (body.url !== undefined && body.url !== null && typeof body.url !== "string") {
    return apiError(422, "invalid_url", "`url` precisa ser texto (https://…) ou null para remover.");
  }
  const result = await saveWebhookConfig(ctx.areaId, {
    url: body.url as string | null | undefined,
    events: body.events,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    rotateSecret: body.rotate_secret === true,
  });
  if (!result.ok) return apiError(result.code === "internal_error" ? 500 : 422, result.code, result.error);
  return apiOk(result.config);
}
