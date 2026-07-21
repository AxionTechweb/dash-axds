import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Cliente Supabase para o SERVIDOR (Server Components, Server Actions, Route
 * Handlers). Lê a sessão dos cookies e opera como usuário autenticado (RLS).
 *
 * Next.js 16: `cookies()` é assíncrono — por isso o await.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado a partir de um Server Component (cookies read-only).
          // O refresh de sessão acontece no proxy.ts (Fase 2), então é seguro ignorar.
        }
      },
    },
  });
}
