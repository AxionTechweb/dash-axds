import { getCloudflareContext } from "@opennextjs/cloudflare";

import { QueryBuilder, type D1Like } from "@/lib/db/query";
import { rpc } from "@/lib/db/rpc";

/**
 * Banco do painel: Cloudflare D1 (binding `DB` no wrangler.jsonc).
 * Dentro de uma request o contexto é síncrono; no build (SSG) precisa do modo
 * assíncrono — por isso o fallback.
 */
let override: D1Like | null = null;

/** Só para scripts/testes: injeta um D1 fora do Worker. */
export function setDbForTesting(db: D1Like | null) {
  override = db;
}

export async function getDb(): Promise<D1Like> {
  if (override) return override;
  try {
    const { env } = getCloudflareContext();
    return (env as unknown as { DB: D1Like }).DB;
  } catch {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { DB: D1Like }).DB;
  }
}

/** Cliente com a mesma forma do supabase-js (`from`, `rpc`). */
export function createDbClient() {
  return {
    // `any` igual ao supabase-js sem tipos gerados: cada chamada tipa o que lê.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => new QueryBuilder<any[]>(getDb, table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(fn, args),
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
