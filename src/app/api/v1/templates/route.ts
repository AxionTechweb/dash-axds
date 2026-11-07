import { createMetaTemplate, listMetaTemplates } from "@/lib/meta-wa/client";
import { toMetaPayload, validateTemplate, type TemplateSpec } from "@/lib/meta-wa/template-spec";
import { apiError, apiOk, authenticate, readJson } from "@/lib/public-api/auth";
import { requireIntegration } from "@/lib/public-api/validate";
import { markTemplatePending } from "@/lib/push-events";

/**
 * GET  /api/v1/templates?status=APPROVED|all — templates da conta na Meta.
 * POST /api/v1/templates — cria um template e envia para aprovação.
 */
export const dynamic = "force-dynamic";

/** Converte os botões do JSON para o formato interno; null se algum tipo for desconhecido. */
function sanitizeButtons(raw: unknown): TemplateSpec["buttons"] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const out: TemplateSpec["buttons"] = [];
  for (const item of raw) {
    const b = (item ?? {}) as Record<string, unknown>;
    switch (b.type) {
      case "URL":
        out.push({ type: "URL", text: str(b.text), url: str(b.url), dynamic: str(b.url).endsWith("{{1}}"), example: str(b.example) });
        break;
      case "QUICK_REPLY":
        out.push({ type: "QUICK_REPLY", text: str(b.text) });
        break;
      case "PHONE_NUMBER":
        out.push({ type: "PHONE_NUMBER", text: str(b.text), phone: str(b.phone) });
        break;
      case "COPY_CODE":
        out.push({ type: "COPY_CODE", example: str(b.example) });
        break;
      default:
        return null as never;
    }
  }
  return out;
}

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const integration = await requireIntegration(ctx.areaId);
  if (integration instanceof Response) return integration;

  const filter = new URL(request.url).searchParams.get("status")?.toUpperCase() ?? "APPROVED";
  const { templates, error } = await listMetaTemplates(integration);
  if (error && templates.length === 0) return apiError(502, "meta_error", `A Meta não listou os templates: ${error}`);

  const list = filter === "ALL" ? templates : templates.filter((t) => t.status === filter);
  return apiOk({
    data: list.map((t) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      header: t.header || null,
      body: t.body,
      footer: t.footer || null,
      buttons: t.buttons,
      variables: t.paramCount,
      rejected_reason: t.rejectedReason,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const spec: TemplateSpec = {
    name: String(body.name ?? "").trim(),
    language: /^[a-z]{2}(_[A-Z]{2})?$/.test(String(body.language ?? "")) ? String(body.language) : "pt_BR",
    category: body.category === "MARKETING" ? "MARKETING" : "UTILITY",
    allowCategoryChange: Boolean(body.allow_category_change),
    headerText: String(body.header ?? ""),
    body: String(body.body ?? ""),
    footer: String(body.footer ?? ""),
    variables: Array.isArray(body.variables)
      ? body.variables.map((v: unknown, i: number) => ({
          name: `var${i + 1}`,
          example: String(typeof v === "object" && v !== null ? (v as { example?: unknown }).example ?? "" : v),
        }))
      : [],
    buttons: sanitizeButtons(body.buttons),
  };
  if (spec.buttons === null) {
    return apiError(422, "invalid_template", "Botão inválido: `type` precisa ser URL, QUICK_REPLY, PHONE_NUMBER ou COPY_CODE.");
  }
  const invalid = validateTemplate(spec);
  if (invalid) return apiError(422, "invalid_template", invalid);

  const integration = await requireIntegration(ctx.areaId);
  if (integration instanceof Response) return integration;

  const result = await createMetaTemplate(integration, toMetaPayload(spec));
  if (!result.ok) return apiError(422, "meta_rejected", `A Meta recusou: ${result.error}`);
  if (result.status !== "APPROVED") await markTemplatePending(ctx.areaId, spec.name, spec.language);

  return apiOk({ name: spec.name, language: spec.language, category: spec.category, status: result.status }, 201);
}
