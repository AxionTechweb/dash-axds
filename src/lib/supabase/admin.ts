import "server-only";

import { createAuth } from "@/lib/db/auth";
import { createDbClient } from "@/lib/db/client";
import { siteUrl } from "@/lib/email/send";

/**
 * Cliente "service" do servidor — agora sobre o Cloudflare D1 (o nome do
 * arquivo ficou por compatibilidade com os imports antigos). Sem RLS: use só
 * no servidor (webhooks, actions, crons). NUNCA exponha ao client.
 */
export function createAdminClient() {
  const noCookies = {
    get: () => undefined,
    set: () => {},
  };
  return {
    ...createDbClient(),
    auth: createAuth(noCookies, () => `${siteUrl()}/auth/confirm?next=/redefinir-senha`),
  };
}
