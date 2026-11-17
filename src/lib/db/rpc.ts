/**
 * As funções SQL que o painel chamava por `.rpc()` no Postgres, reescritas em
 * TypeScript sobre o D1. Mesmos nomes e parâmetros (p_*), mesmo retorno.
 */
import { getDb } from "@/lib/db/client";
import type { DbResult } from "@/lib/db/query";
import { aesDecrypt, aesEncrypt } from "@/lib/db/aes";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

type Args = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

async function rateLimitHit(a: Args): Promise<boolean> {
  const windowSeconds = Number(a.p_window_seconds);
  const max = Number(a.p_max);
  const start = new Date(Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds * 1000).toISOString();
  const db = await getDb();
  const row = (await db
    .prepare(
      `INSERT INTO rate_limit_counters (bucket_key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(String(a.p_key), start)
    .first()) as { count: number } | null;
  return (row?.count ?? 1) <= max;
}

async function rateLimitCleanup(a: Args): Promise<null> {
  const secs = Number(a.p_older_than_seconds ?? 3600);
  const cutoff = new Date(Date.now() - secs * 1000).toISOString();
  const db = await getDb();
  await db.prepare("DELETE FROM rate_limit_counters WHERE window_start < ?").bind(cutoff).run();
  return null;
}

const VISITOR_FIELDS = [
  "email", "telefone", "nome",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "referrer", "ip", "user_agent", "geo_country", "geo_region", "geo_city",
] as const;

/** UTMs last touch: valor novo sobrescreve, nulo nunca apaga o anterior. */
async function identifyVisitor(a: Args): Promise<null> {
  const db = await getDb();
  const cols = ["area_id", "user_id", ...VISITOR_FIELDS];
  const values = [s(a.p_area_id), s(a.p_user_id), ...VISITOR_FIELDS.map((f) => s(a[`p_${f}`]))];
  await db
    .prepare(
      `INSERT INTO visitors (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
       ON CONFLICT (area_id, user_id) DO UPDATE SET
       ${VISITOR_FIELDS.map((f) => `${f} = coalesce(excluded.${f}, visitors.${f})`).join(",\n       ")}`,
    )
    .bind(...values)
    .run();
  return null;
}

/** Evento enriquecido com UTM/GEO do visitante quando o payload não traz. */
async function logEvent(a: Args): Promise<null> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO events_log (
         area_id, user_id, event_name,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         ip, geo_country, geo_region, geo_city, page_url, fbp, fbc, created_at)
       SELECT ?1, ?2, ?3,
         coalesce(?4, v.utm_source), coalesce(?5, v.utm_medium), coalesce(?6, v.utm_campaign),
         coalesce(?7, v.utm_term), coalesce(?8, v.utm_content),
         ?9, coalesce(?10, v.geo_country), coalesce(?11, v.geo_region), coalesce(?12, v.geo_city),
         ?13, ?14, ?15, ${NOW}
       FROM (SELECT 1) AS one
       LEFT JOIN visitors v ON v.area_id = ?1 AND v.user_id = ?2`,
    )
    .bind(
      s(a.p_area_id), s(a.p_user_id), s(a.p_event_name),
      s(a.p_utm_source), s(a.p_utm_medium), s(a.p_utm_campaign), s(a.p_utm_term), s(a.p_utm_content),
      s(a.p_ip), s(a.p_geo_country), s(a.p_geo_region), s(a.p_geo_city),
      s(a.p_page_url), s(a.p_fbp), s(a.p_fbc),
    )
    .run();
  return null;
}

const FUNCTIONS: Record<string, (a: Args) => Promise<unknown>> = {
  rate_limit_hit: rateLimitHit,
  rate_limit_cleanup: rateLimitCleanup,
  identify_visitor: identifyVisitor,
  log_event: logEvent,
  app_encrypt: async (a) => (a.plaintext == null ? null : aesEncrypt(String(a.plaintext), String(a.key))),
  app_decrypt: async (a) => (a.ciphertext == null ? null : aesDecrypt(String(a.ciphertext), String(a.key))),
};

export async function rpc(fn: string, args: Args): Promise<DbResult> {
  const impl = FUNCTIONS[fn];
  if (!impl) {
    return { data: null, error: { message: `função ${fn} não existe no D1`, code: "42883", details: null, hint: null }, count: null, status: 404 };
  }
  try {
    return { data: await impl(args), error: null, count: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db] rpc ${fn}:`, message);
    return { data: null, error: { message, code: "XX000", details: null, hint: null }, count: null, status: 500 };
  }
}
