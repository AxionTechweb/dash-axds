/** GET /api/v1/docs — atalho para a documentação navegável. */
export function GET(request: Request) {
  return Response.redirect(new URL("/docs/api", request.url), 307);
}
