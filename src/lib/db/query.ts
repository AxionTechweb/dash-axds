/**
 * Camada de dados no Cloudflare D1 com a MESMA API que o painel usava do
 * supabase-js (`.from(t).select().eq().order()...`). Assim as páginas, actions
 * e webhooks continuam iguais e só o cliente por baixo mudou.
 *
 * Cobertura (é o que o código usa — ver `grep` no histórico da migração):
 *   select · insert · upsert · update · delete
 *   eq · neq · gt · gte · lt · lte · like · ilike · in · is · not · match
 *   order · limit · range · single · maybeSingle · count ("exact") / head
 *
 * Tipos (ver d1/schema.src.sql): boolean ↔ 0/1, jsonb/text[] ↔ TEXT JSON,
 * timestamptz ↔ TEXT ISO-8601 UTC ("2026-11-17T15:00:00.000Z") — o mesmo
 * formato do `toISOString()`, então gte/lte/order comparam certo como texto.
 */
import { SCHEMA, type TableMeta } from "@/lib/db/schema-meta";

/** Binding mínimo do D1 que usamos (evita depender dos tipos globais do workers). */
export interface D1Like {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<{ results?: unknown[] }[]>;
}
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  all(): Promise<{ results?: unknown[] }>;
  first(): Promise<unknown>;
  run(): Promise<unknown>;
}

export type DbError = { message: string; code: string; details: string | null; hint: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult<T = any> = { data: T; error: DbError | null; count: number | null; status: number };

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  const n = name.trim();
  if (!IDENT.test(n)) throw new Error(`coluna/tabela inválida: ${name}`);
  return `"${n}"`;
}

function toDbError(err: unknown): DbError {
  const message = err instanceof Error ? err.message : String(err);
  let code = "XX000";
  if (/UNIQUE constraint failed|PRIMARY KEY/i.test(message)) code = "23505";
  else if (/FOREIGN KEY constraint failed/i.test(message)) code = "23503";
  else if (/NOT NULL constraint failed/i.test(message)) code = "23502";
  else if (/CHECK constraint failed/i.test(message)) code = "23514";
  return { message, code, details: null, hint: null };
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Converte um valor JS para o que vai no bind do D1. */
function encodeValue(meta: TableMeta | undefined, col: string, v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? 1 : 0;
  if (meta?.json.includes(col)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && meta?.ts.includes(col) && ISO_LIKE.test(v)) {
    const d = new Date(v.includes("T") || /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : v.replace(" ", "T") + "Z");
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return v;
}

/** Converte a linha do D1 de volta ao formato que o supabase-js entregava. */
function decodeRow(meta: TableMeta | undefined, row: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return row;
  for (const c of meta.bool) if (c in row && row[c] !== null) row[c] = row[c] === 1 || row[c] === true;
  for (const c of meta.json) {
    const v = row[c];
    if (typeof v === "string") {
      try {
        row[c] = JSON.parse(v);
      } catch {
        /* texto que não é JSON: devolve como está */
      }
    }
  }
  return row;
}

type Op = "select" | "insert" | "upsert" | "update" | "delete";
type Filter = { sql: string; params: unknown[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class QueryBuilder<T = any[]> implements PromiseLike<DbResult<T>> {
  private op: Op = "select";
  private cols = "*";
  private returning = false;
  private countMode: "exact" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private readonly meta: TableMeta | undefined;

  constructor(
    private readonly getDb: () => Promise<D1Like>,
    private readonly table: string,
  ) {
    ident(table);
    this.meta = SCHEMA[table];
  }

  // ---- operações ------------------------------------------------------------
  select(columns = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.op === "select") {
      this.cols = columns;
      if (opts?.count) this.countMode = "exact";
      if (opts?.head) this.head = true;
    } else {
      this.returning = true;
      this.cols = columns;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { count?: string }): this {
    void opts;
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.op = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = "update";
    this.patch = values;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  // ---- filtros --------------------------------------------------------------
  private add(col: string, sqlOp: string, v: unknown): this {
    this.filters.push({ sql: `${ident(col)} ${sqlOp} ?`, params: [encodeValue(this.meta, col, v)] });
    return this;
  }
  eq(col: string, v: unknown): this {
    if (v === null) return this.is(col, null);
    return this.add(col, "=", v);
  }
  neq(col: string, v: unknown): this {
    if (v === null) return this.not(col, "is", null);
    // Postgres: `col <> v` não traz NULL. Igual no SQLite.
    return this.add(col, "<>", v);
  }
  gt(col: string, v: unknown): this {
    return this.add(col, ">", v);
  }
  gte(col: string, v: unknown): this {
    return this.add(col, ">=", v);
  }
  lt(col: string, v: unknown): this {
    return this.add(col, "<", v);
  }
  lte(col: string, v: unknown): this {
    return this.add(col, "<=", v);
  }
  /** LIKE do Postgres diferencia maiúsculas; o do SQLite não (só ASCII). Uso aqui é com prefixos fixos. */
  like(col: string, pattern: string): this {
    return this.add(col, "LIKE", pattern);
  }
  ilike(col: string, pattern: string): this {
    this.filters.push({ sql: `lower(${ident(col)}) LIKE lower(?)`, params: [pattern] });
    return this;
  }
  in(col: string, values: readonly unknown[]): this {
    if (!values.length) {
      this.filters.push({ sql: "0", params: [] });
      return this;
    }
    this.filters.push({
      sql: `${ident(col)} IN (${values.map(() => "?").join(", ")})`,
      params: values.map((v) => encodeValue(this.meta, col, v)),
    });
    return this;
  }
  is(col: string, v: null | boolean): this {
    if (v === null) this.filters.push({ sql: `${ident(col)} IS NULL`, params: [] });
    else this.filters.push({ sql: `${ident(col)} = ?`, params: [v ? 1 : 0] });
    return this;
  }
  not(col: string, op: string, v: unknown): this {
    const c = ident(col);
    if (op === "is") {
      if (v === null || v === "null") this.filters.push({ sql: `${c} IS NOT NULL`, params: [] });
      else this.filters.push({ sql: `${c} IS NOT ?`, params: [v ? 1 : 0] });
    } else if (op === "eq") {
      this.filters.push({ sql: `(${c} IS NULL OR ${c} <> ?)`, params: [encodeValue(this.meta, col, v)] });
    } else if (op === "in") {
      const list = Array.isArray(v)
        ? v
        : String(v)
            .replace(/^\(|\)$/g, "")
            .split(",")
            .map((s) => s.trim().replace(/^"|"$/g, ""));
      this.filters.push({ sql: `${c} NOT IN (${list.map(() => "?").join(", ")})`, params: list });
    } else {
      throw new Error(`.not(${col}, ${op}) não suportado na camada D1`);
    }
    return this;
  }
  match(obj: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }

  // ---- modificadores --------------------------------------------------------
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const asc = opts?.ascending ?? true;
    // Postgres: ASC → NULLS LAST, DESC → NULLS FIRST (padrões). SQLite é o contrário.
    const nullsFirst = opts?.nullsFirst ?? !asc;
    const c = ident(col);
    this.orders.push(`(${c} IS NULL) ${nullsFirst ? "DESC" : "ASC"}`, `${c} ${asc ? "ASC" : "DESC"}`);
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number): this {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single(): QueryBuilder<any> {
    this.singleMode = "single";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as unknown as QueryBuilder<any>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeSingle(): QueryBuilder<any> {
    this.singleMode = "maybe";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as unknown as QueryBuilder<any>;
  }

  // ---- execução -------------------------------------------------------------
  private where(): { sql: string; params: unknown[] } {
    if (!this.filters.length) return { sql: "", params: [] };
    return {
      sql: ` WHERE ${this.filters.map((f) => f.sql).join(" AND ")}`,
      params: this.filters.flatMap((f) => f.params),
    };
  }

  private colList(): string {
    const raw = this.cols.trim();
    if (raw === "*" || raw === "") return "*";
    return raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c === "*" ? "*" : ident(c)))
      .join(", ");
  }

  private tail(): string {
    let s = "";
    if (this.orders.length) s += ` ORDER BY ${this.orders.join(", ")}`;
    if (this.singleMode === "maybe" && this.limitN === null) s += " LIMIT 2";
    else if (this.limitN !== null) s += ` LIMIT ${Math.max(0, Math.floor(this.limitN))}`;
    if (this.offsetN !== null) {
      if (this.limitN === null) s += " LIMIT -1";
      s += ` OFFSET ${Math.max(0, Math.floor(this.offsetN))}`;
    }
    return s;
  }

  private insertSql(row: Record<string, unknown>): { sql: string; params: unknown[] } {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    const t = ident(this.table);
    const colsSql = keys.map(ident).join(", ");
    const params = keys.map((k) => encodeValue(this.meta, k, row[k]));
    let sql = keys.length
      ? `INSERT INTO ${t} (${colsSql}) VALUES (${keys.map(() => "?").join(", ")})`
      : `INSERT INTO ${t} DEFAULT VALUES`;

    if (this.op === "upsert") {
      if (this.ignoreDuplicates) {
        sql += " ON CONFLICT DO NOTHING";
      } else {
        const target = (this.onConflict ?? this.meta?.pk.join(",") ?? "id")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const updatable = keys.filter((k) => !target.includes(k));
        sql += ` ON CONFLICT (${target.map(ident).join(", ")}) `;
        sql += updatable.length
          ? `DO UPDATE SET ${updatable.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`
          : "DO NOTHING";
      }
    }
    if (this.returning) sql += ` RETURNING ${this.colList()}`;
    return { sql, params };
  }

  private async execute(): Promise<DbResult<T>> {
    try {
      const db = await this.getDb();
      const t = ident(this.table);
      let rows: Record<string, unknown>[] = [];
      let count: number | null = null;

      if (this.op === "select") {
        const w = this.where();
        if (this.countMode) {
          const r = (await db
            .prepare(`SELECT count(*) AS n FROM ${t}${w.sql}`)
            .bind(...w.params)
            .first()) as { n: number } | null;
          count = r?.n ?? 0;
        }
        if (!this.head) {
          const r = await db
            .prepare(`SELECT ${this.colList()} FROM ${t}${w.sql}${this.tail()}`)
            .bind(...w.params)
            .all();
          rows = (r.results ?? []) as Record<string, unknown>[];
        }
      } else if (this.op === "insert" || this.op === "upsert") {
        const stmts = this.rows.map((row) => {
          const q = this.insertSql(row);
          return db.prepare(q.sql).bind(...q.params);
        });
        if (stmts.length === 1) {
          const r = await stmts[0].all();
          rows = (r.results ?? []) as Record<string, unknown>[];
        } else if (stmts.length > 1) {
          // batch = uma transação: ou grava tudo ou nada (igual ao insert em lote do Postgres).
          const res = await db.batch(stmts);
          rows = res.flatMap((r) => (r.results ?? []) as Record<string, unknown>[]);
        }
      } else if (this.op === "update") {
        const keys = Object.keys(this.patch).filter((k) => this.patch[k] !== undefined);
        if (!keys.length) return { data: (this.returning ? [] : null) as T, error: null, count: null, status: 200 };
        const w = this.where();
        const set = keys.map((k) => `${ident(k)} = ?`).join(", ");
        const params = [...keys.map((k) => encodeValue(this.meta, k, this.patch[k])), ...w.params];
        const sql = `UPDATE ${t} SET ${set}${w.sql}${this.returning ? ` RETURNING ${this.colList()}` : ""}`;
        const r = await db.prepare(sql).bind(...params).all();
        rows = (r.results ?? []) as Record<string, unknown>[];
      } else {
        const w = this.where();
        const sql = `DELETE FROM ${t}${w.sql}${this.returning ? ` RETURNING ${this.colList()}` : ""}`;
        const r = await db.prepare(sql).bind(...w.params).all();
        rows = (r.results ?? []) as Record<string, unknown>[];
      }

      rows = rows.map((r) => decodeRow(this.meta, r));

      const isRead = this.op === "select" || this.returning;
      if (!isRead) return { data: null as T, error: null, count, status: 204 };
      if (this.head) return { data: null as T, error: null, count, status: 200 };

      if (this.singleMode) {
        if (rows.length > 1) {
          return {
            data: null as T,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `${rows.length} rows`, hint: null },
            count,
            status: 406,
          };
        }
        if (rows.length === 0) {
          if (this.singleMode === "maybe") return { data: null as T, error: null, count, status: 200 };
          return {
            data: null as T,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: "0 rows", hint: null },
            count,
            status: 406,
          };
        }
        return { data: rows[0] as T, error: null, count, status: 200 };
      }
      return { data: rows as T, error: null, count, status: 200 };
    } catch (err) {
      const error = toDbError(err);
      console.error(`[db] ${this.op} ${this.table}:`, error.message);
      return { data: null as T, error, count: null, status: 500 };
    }
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
