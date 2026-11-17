// Gera, a partir de d1/schema.src.sql:
//   - d1/migrations/0001_init.sql   (SQL aplicado no D1)
//   - src/lib/db/schema-meta.ts      (tipos das colunas para a camada de dados)
// Uso: node scripts/build-d1-schema.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const UUID =
  "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || " +
  "substr(lower(hex(randomblob(2))), 2) || '-' || " +
  "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || " +
  "lower(hex(randomblob(6))))";
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

const src = readFileSync("d1/schema.src.sql", "utf8");

// ---- metadados -------------------------------------------------------------
const meta = {};
const tableRe = /create table (\w+) \(([\s\S]*?)\n\);/g;
for (const m of src.matchAll(tableRe)) {
  const [, table, body] = m;
  const t = { columns: [], bool: [], json: [], ts: [], pk: [] };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    const pkM = line.match(/^primary key \(([^)]+)\)/);
    if (pkM) {
      t.pk = pkM[1].split(",").map((s) => s.trim());
      continue;
    }
    if (/^(unique|constraint|check)\b/.test(line)) continue;
    const col = line.match(/^(\w+)\s+(text|integer|real)\b/);
    if (!col) continue;
    const name = col[1];
    t.columns.push(name);
    if (line.includes("/*bool*/")) t.bool.push(name);
    if (line.includes("/*json*/")) t.json.push(name);
    if (line.includes("/*ts*/")) t.ts.push(name);
    if (/\bprimary key\b/.test(line)) t.pk = [name];
  }
  meta[table] = t;
}

// ---- SQL -------------------------------------------------------------------
let sql = src
  .replaceAll("{UUID}", UUID)
  .replaceAll("{NOW}", NOW)
  .replaceAll(/\/\*(bool|json|ts)\*\//g, "");

// updated_at automático (equivalente ao trigger set_updated_at do Postgres).
// Só dispara quando a escrita não mexeu no updated_at (sem recursão: o
// recursive_triggers do SQLite vem desligado).
const triggers = Object.entries(meta)
  .filter(([, t]) => t.columns.includes("updated_at"))
  .map(
    ([table]) =>
      `create trigger ${table}_set_updated_at after update on ${table}\n` +
      `for each row when new.updated_at is old.updated_at begin\n` +
      `  update ${table} set updated_at = ${NOW} where rowid = new.rowid;\n` +
      `end;`,
  )
  .join("\n\n");

sql += `\n-- updated_at automático\n${triggers}\n`;

mkdirSync("d1/migrations", { recursive: true });
writeFileSync("d1/migrations/0001_init.sql", sql);

const ts =
  `// GERADO por scripts/build-d1-schema.mjs a partir de d1/schema.src.sql — não editar à mão.\n\n` +
  `export type TableMeta = {\n  columns: readonly string[];\n  bool: readonly string[];\n  json: readonly string[];\n  ts: readonly string[];\n  pk: readonly string[];\n};\n\n` +
  `export const SCHEMA: Record<string, TableMeta> = ${JSON.stringify(meta, null, 2)};\n`;
mkdirSync("src/lib/db", { recursive: true });
writeFileSync("src/lib/db/schema-meta.ts", ts);

console.log(`${Object.keys(meta).length} tabelas`);
for (const [k, t] of Object.entries(meta)) if (!t.pk.length) console.warn("sem PK:", k);
