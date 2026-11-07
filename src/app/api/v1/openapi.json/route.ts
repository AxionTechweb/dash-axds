import { buildOpenApi } from "@/lib/public-api/spec";

/** GET /api/v1/openapi.json — especificação OpenAPI 3 da API pública (sem autenticação). */
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return Response.json(buildOpenApi(`${proto}://${host}`), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
