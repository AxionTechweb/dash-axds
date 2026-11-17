import { NextResponse, type NextRequest } from "next/server";

import { getUserFromSessionToken, SESSION_COOKIE } from "@/lib/db/auth";

/**
 * Next.js 16: `middleware` foi renomeado para `proxy` (runtime nodejs, sem edge).
 *
 * Responsabilidades:
 *  1. Conferir a sessão do painel (cookie httpOnly → tabela auth_sessions no D1).
 *  2. Proteger as rotas do painel — sem sessão, redireciona para /login.
 *
 * Rotas públicas: /login, /setup, o fluxo de redefinição de senha
 * (/esqueci-senha, /auth/confirm, /redefinir-senha), as páginas públicas de
 * texto (/docs, /privacidade) e /api/* (os endpoints
 * públicos de captura e webhooks fazem a própria validação: zod + rate
 * limit + CORS/assinatura).
 */

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/esqueci-senha",
  "/auth/confirm",
  "/redefinir-senha",
  "/docs",
  "/privacidade",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rota pública sem cookie: nem consulta o banco.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token && isPublic(pathname)) return NextResponse.next({ request });

  const user = token ? await getUserFromSessionToken(token) : null;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next({ request });
  // Cookie de sessão inválido/expirado: limpa pra não consultar o banco à toa.
  if (token && !user) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto arquivos estáticos, imagens e o manifest do PWA
     * (precisa ser servido direto — sem sessão, o navegador recebe um
     * redirect pro /login em vez do JSON, e a instalação quebra).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
