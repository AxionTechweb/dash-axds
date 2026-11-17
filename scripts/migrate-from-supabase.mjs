// Migração dos dados Supabase (Postgres) → Cloudflare D1.
//
// Uso (PowerShell/bash, com as variáveis só na sessão — nunca gravadas):
//   SUPABASE_DB_URL="postgresql://..."  ENCRYPTION_KEY="<a mesma da Vercel>" \
//   node scripts/migrate-from-supabase.mjs --dry-run            # só conta linhas
//   node scripts/migrate-from-supabase.mjs --out .migration      # gera os .sql
//   node scripts/migrate-from-supabase.mjs --out .migration --apply [--local]
//
// - Segredos: o Postgres decifra (app_decrypt com a ENCRYPTION_KEY atual) e o
//   script recifra em AES-GCM ("v2:"), o formato do Worker. Mesma chave.
// - Usuários: auth.users → auth_users com o hash bcrypt (senha não muda).
// - Datas → ISO UTC com ms; numeric → número; jsonb/text[] → JSON; bool → 0/1.
// - Padrão: INSERT OR IGNORE — só acrescenta o que falta e NUNCA sobrescreve o
//   que já está no D1 (na virada, venda que chegou direto no Worker fica).
//   --fresh: apaga as tabelas no D1 antes (carga inicial / ensaio).
//   --unschedule-pg-cron: desliga os jobs do pg_cron no Supabase (virada).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import path from "node:path";

import pg from "pg";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const DRY = flag("--dry-run");
const OUT = opt("--out") ?? ".migration";
const APPLY = flag("--apply");
const LOCAL = flag("--local");
const DB_NAME = opt("--d1") ?? "dash-axds";
const FRESH = flag("--fresh");
const UNSCHEDULE = flag("--unschedule-pg-cron");

const conn = process.env.SUPABASE_DB_URL;
const key = process.env.ENCRYPTION_KEY;
if (!conn || !key) {
  console.error("Defina SUPABASE_DB_URL e ENCRYPTION_KEY no ambiente desta sessão.");
  process.exit(1);
}

// ---- schema do D1 (mesma fonte da migration) ---------------------------------
const metaSrc = readFileSync("src/lib/db/schema-meta.ts", "utf8");
const SCHEMA = JSON.parse(metaSrc.slice(metaSrc.indexOf("= {") + 2, metaSrc.lastIndexOf(";")));

/** Colunas cifradas com pgcrypto no Supabase (recifradas aqui). */
const ENCRYPTED = {
  checkout_integrations: ["secret"],
  meta_ad_accounts: ["ads_token"],
  vturb_integrations: ["api_key"],
  google_sheets_integrations: ["service_account_json"],
  daily_campaign_sheets: ["service_account_json"],
  ga4_integrations: ["service_account_json"],
  whatsapp_integrations: ["api_key"],
  meta_wa_integrations: ["access_token"],
  api_credentials: ["webhook_secret"],
};

/** Ordem de carga (pais antes dos filhos). */
const ORDER = [
  "areas", "branding", "settings", "meta_ad_accounts", "visitors", "events_log", "purchases",
  "automation_rules", "rule_executions", "audit_log", "checkout_integrations", "product_tiers",
  "vturb_integrations", "vturb_players", "google_sheets_integrations", "creative_reports",
  "weekly_report_runs", "daily_campaign_sheets", "daily_campaign_checkpoints", "ga4_integrations",
  "ga4_landing_pages", "ga4_session_sources", "ga4_source_mediums", "whatsapp_integrations",
  "alert_state", "support_ai_sessions", "meta_wa_integrations", "wa_dispatch_rules", "api_campaigns",
  "wa_dispatch_log", "wa_optouts", "api_credentials", "api_webhook_deliveries",
  "auth_users", "push_subscriptions",
];
const SKIP = new Set(["rate_limit_counters", "auth_sessions", "auth_tokens"]);
for (const t of Object.keys(SCHEMA)) {
  if (!ORDER.includes(t) && !SKIP.has(t)) throw new Error(`tabela fora da ordem de carga: ${t}`);
}

// ---- conversões ---------------------------------------------------------------
async function aesEncrypt(plain) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plain)));
  return "v2:" + Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString("base64");
}

export function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function convert(meta, col, v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (meta.bool.includes(col)) return v === true || v === "t" || v === 1 ? 1 : 0;
  if (meta.json.includes(col)) return typeof v === "string" ? v : JSON.stringify(v);
  if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

// date (1082) como texto puro "YYYY-MM-DD" (sem fuso); numeric (1700) como número.
pg.types.setTypeParser(1082, (s) => s);
pg.types.setTypeParser(1700, (s) => (s === null ? null : Number(s)));
pg.types.setTypeParser(20, (s) => (s === null ? null : Number(s)));

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

async function pgColumns(table) {
  const r = await client.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function exportTable(table) {
  const meta = SCHEMA[table];
  if (table === "auth_users") {
    const r = await client.query(
      `select id::text, email, encrypted_password as password_hash,
              coalesce(raw_user_meta_data, '{}'::jsonb) as user_metadata,
              email_confirmed_at, last_sign_in_at, created_at, updated_at
       from auth.users where deleted_at is null and email is not null`,
    );
    // Convidado que nunca definiu senha vem com hash vazio.
    for (const row of r.rows) if (!row.password_hash) row.password_hash = null;
    return r.rows;
  }
  const have = await pgColumns(table);
  if (!have.size) return null; // tabela não existe no Supabase
  const enc = ENCRYPTED[table] ?? [];
  const cols = meta.columns.filter((c) => have.has(c) || (table === "branding" && c === "id"));
  const select = cols
    .map((c) => {
      if (enc.includes(c)) return `public.app_decrypt("${c}", $1) as "${c}"`;
      if (table === "branding" && c === "id") return `1 as id`;
      return `"${c}"`;
    })
    .join(", ");
  const r = await client.query(`select ${select} from public."${table}"`, enc.length ? [key] : []);
  for (const row of r.rows) for (const c of enc) if (row[c] != null) row[c] = await aesEncrypt(row[c]);
  return r.rows;
}

// ---- execução ---------------------------------------------------------------
if (!DRY) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

const files = [];
const summary = [];
let fileNo = 0;
const MAX_BYTES = 800_000;

// 000: limpa tudo (filhos antes dos pais) — só com --fresh.
if (!DRY && FRESH) {
  const del = [...ORDER].reverse().map((t) => `DELETE FROM "${t}";`).join("\n");
  const f = path.join(OUT, `${String(fileNo++).padStart(3, "0")}_limpa.sql`);
  writeFileSync(f, `PRAGMA defer_foreign_keys = true;\n${del}\n`);
  files.push(f);
}

for (const table of ORDER) {
  const rows = await exportTable(table);
  if (rows === null) {
    summary.push([table, "—"]);
    continue;
  }
  summary.push([table, rows.length]);
  if (DRY || rows.length === 0) continue;
  const meta = SCHEMA[table];
  let buf = "";
  let part = 0;
  const flush = () => {
    if (!buf) return;
    const f = path.join(OUT, `${String(fileNo++).padStart(3, "0")}_${table}_${part++}.sql`);
    writeFileSync(f, `PRAGMA defer_foreign_keys = true;\n${buf}`);
    files.push(f);
    buf = "";
  };
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => meta.columns.includes(c));
    const vals = cols.map((c) => sqlLiteral(convert(meta, c, row[c])));
    const stmt = `INSERT OR IGNORE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.join(", ")});\n`;
    if (buf.length + stmt.length > MAX_BYTES) flush();
    buf += stmt;
  }
  flush();
}
if (UNSCHEDULE && !DRY) {
  const r = await client.query("select jobname from cron.job where jobname like 'panel-%'");
  for (const { jobname } of r.rows) await client.query("select cron.unschedule($1)", [jobname]);
  console.log(`pg_cron desligado: ${r.rows.map((x) => x.jobname).join(", ") || "(nenhum job)"}`);
}
await client.end();

console.table(summary.map(([t, n]) => ({ tabela: t, linhas: n })));
if (DRY) process.exit(0);
console.log(`${files.length} arquivos em ${OUT}/`);

if (APPLY) {
  for (const f of files) {
    process.stdout.write(`aplicando ${path.basename(f)}... `);
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", DB_NAME, LOCAL ? "--local" : "--remote", "--yes", "--file", f],
      { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
    );
    console.log("ok");
  }
  console.log("Importação concluída.");
}
