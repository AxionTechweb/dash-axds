import { cookies } from "next/headers";

import { createAuth, SESSION_COOKIE } from "@/lib/db/auth";
import { createDbClient } from "@/lib/db/client";
import { siteUrl } from "@/lib/email/send";

/**
 * Cliente do SERVIDOR (Server Components, Server Actions, Route Handlers) —
 * agora sobre o Cloudflare D1 + login próprio (cookie de sessão).
 * Quem chega aqui já passou pelo proxy.ts (rotas do painel exigem sessão).
 *
 * Next.js 16: `cookies()` é assíncrono — por isso o await.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const auth = createAuth(
    {
      get: (name) => cookieStore.get(name)?.value,
      set: (name, value, { maxAge }) => {
        try {
          cookieStore.set(name, value, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge,
          });
        } catch {
          // Server Component: cookies são read-only. Login/logout acontecem em actions.
        }
      },
    },
    () => `${siteUrl()}/auth/confirm?next=/redefinir-senha`,
  );
  return { ...createDbClient(), auth };
}

export { SESSION_COOKIE };
