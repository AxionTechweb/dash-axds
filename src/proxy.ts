import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Next.js 16: `middleware` foi renomeado para `proxy` (runtime nodejs, sem edge).
 *
 * Responsabilidades:
 *  1. Renovar a sessão do Supabase a cada request (cookies).
 *  2. Proteger as rotas do painel — sem sessão, redireciona para /login.
 *
 * Rotas públicas: /login, /setup, o fluxo de redefinição de senha
 * (/esqueci-senha, /auth/confirm, /redefinir-senha) e /api/* (os endpoints
 * públicos de captura e webhooks fazem a própria validação: zod + rate
 * limit + CORS/assinatura).
 */

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/esqueci-senha",
  "/auth/confirm",
  "/redefinir-senha",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  // Primeira execução (env ainda não configurado): não bloqueia nada, deixa a
  // aplicação renderizar as instruções de setup.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: getUser() revalida o token no servidor de Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

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

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto arquivos estáticos, imagens e o manifest do PWA
     * (precisa ser servido direto — sem sessão, o navegador recebe um
     * redirect pro /login em vez do JSON, e a instalação quebra).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
