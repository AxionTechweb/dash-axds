/**
 * Login do painel no D1, com a mesma forma do `supabase.auth` que o código já
 * chamava (getUser, signInWithPassword, signOut, resetPasswordForEmail,
 * verifyOtp/exchangeCodeForSession, updateUser e admin.*).
 *
 * - Senha: bcrypt (o hash importado do auth.users do Supabase continua valendo).
 * - Sessão: token aleatório no cookie httpOnly; no banco só o SHA-256 dele.
 * - Reset/convite: token de uso único por e-mail (Resend), troca por sessão em
 *   /auth/confirm e a pessoa define a senha em /redefinir-senha.
 */
import bcrypt from "bcryptjs";

import { getDb } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";

export const SESSION_COOKIE = "axds_session";
const SESSION_DAYS = 30;
const RECOVERY_HOURS = 1;
const INVITE_DAYS = 7;

export type CookieAccess = {
  get(name: string): string | undefined;
  /** Pode lançar quando chamado de um Server Component (cookies read-only). */
  set(name: string, value: string, opts: { maxAge: number }): void;
};

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

type AuthError = { message: string; status?: number };
const err = (message: string, status = 400): AuthError => ({ message, status });
const ok = null as AuthError | null;

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(v: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}

const nowIso = () => new Date().toISOString();
const plus = (ms: number) => new Date(Date.now() + ms).toISOString();

function toUser(row: Record<string, unknown>): AuthUser {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(row.user_metadata ?? "{}"));
  } catch {
    /* ignora */
  }
  return {
    id: String(row.id),
    email: String(row.email),
    user_metadata: meta,
    created_at: String(row.created_at),
    last_sign_in_at: (row.last_sign_in_at as string) ?? null,
    email_confirmed_at: (row.email_confirmed_at as string) ?? null,
  };
}

export async function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 10);
}

/** Aceita $2a$/$2b$/$2y$ (bcrypt do Supabase e o nosso). */
export async function verifyPassword(hash: string | null | undefined, p: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(p, hash.replace(/^\$2y\$/, "$2b$"));
  } catch {
    return false;
  }
}

async function userBySessionToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), nowIso())
    .first()) as Record<string, unknown> | null;
  return row ? toUser(row) : null;
}

/** Usado pelo proxy.ts: só confere o cookie, sem mexer em nada. */
export async function getUserFromSessionToken(token: string | undefined): Promise<AuthUser | null> {
  try {
    return await userBySessionToken(token);
  } catch (e) {
    console.error("[auth] sessão:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function startSession(cookies: CookieAccess, userId: string, kind: "session" | "recovery") {
  const token = randomToken();
  const db = await getDb();
  await db
    .prepare("INSERT INTO auth_sessions (id, user_id, kind, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, kind, plus(SESSION_DAYS * 86_400_000))
    .run();
  cookies.set(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86_400 });
}

async function sendLinkEmail(email: string, link: string, kind: "recovery" | "invite") {
  const subject = kind === "invite" ? "Você foi convidado para o painel" : "Redefinir sua senha";
  const action = kind === "invite" ? "Criar minha senha" : "Redefinir senha";
  const intro =
    kind === "invite"
      ? "Você recebeu acesso ao painel. Clique abaixo para criar sua senha (o link vale 7 dias)."
      : "Recebemos um pedido para redefinir a sua senha. O link vale 1 hora. Se não foi você, ignore este e-mail.";
  await sendEmail({
    to: email,
    subject,
    html: `<p>${intro}</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:999px;text-decoration:none">${action}</a></p><p style="color:#666;font-size:12px">${link}</p>`,
  });
}

async function issueLink(userId: string, email: string, kind: "recovery" | "invite", redirectTo: string) {
  const token = randomToken();
  const db = await getDb();
  const ttl = kind === "invite" ? INVITE_DAYS * 86_400_000 : RECOVERY_HOURS * 3_600_000;
  await db
    .prepare("INSERT INTO auth_tokens (id, user_id, kind, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, kind, plus(ttl))
    .run();
  const url = new URL(redirectTo);
  url.searchParams.set("token_hash", token);
  url.searchParams.set("type", kind);
  await sendLinkEmail(email, url.toString(), kind);
}

export function createAuth(cookies: CookieAccess, inviteRedirect: () => string) {
  const currentToken = () => cookies.get(SESSION_COOKIE);

  return {
    async getUser() {
      try {
        const user = await userBySessionToken(currentToken());
        return { data: { user }, error: user ? null : err("Auth session missing!", 401) };
      } catch (e) {
        return { data: { user: null }, error: err(e instanceof Error ? e.message : "erro", 500) };
      }
    },

    async getSession() {
      const user = await userBySessionToken(currentToken()).catch(() => null);
      return { data: { session: user ? { access_token: "", user } : null }, error: ok };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const db = await getDb();
      const row = (await db
        .prepare("SELECT * FROM auth_users WHERE email = ? COLLATE NOCASE")
        .bind(email.trim())
        .first()) as Record<string, unknown> | null;
      // Compara mesmo sem usuário, pra não revelar por tempo de resposta se o e-mail existe.
      const ok = await verifyPassword((row?.password_hash as string) ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva", password);
      if (!row || !ok) return { data: { user: null, session: null }, error: err("Invalid login credentials") };
      await startSession(cookies, String(row.id), "session");
      await db.prepare("UPDATE auth_users SET last_sign_in_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
      return { data: { user: toUser(row), session: {} }, error: ok };
    },

    async signOut() {
      const token = currentToken();
      if (token) {
        const db = await getDb();
        await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(await sha256Hex(token)).run();
      }
      try {
        cookies.set(SESSION_COOKIE, "", { maxAge: 0 });
      } catch {
        /* Server Component */
      }
      return { error: ok };
    },

    async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
      try {
        const db = await getDb();
        const row = (await db
          .prepare("SELECT id, email FROM auth_users WHERE email = ? COLLATE NOCASE")
          .bind(email.trim())
          .first()) as { id: string; email: string } | null;
        if (row) await issueLink(row.id, row.email, "recovery", opts?.redirectTo ?? inviteRedirect());
        return { data: {}, error: ok };
      } catch (e) {
        console.error("[auth] reset:", e instanceof Error ? e.message : e);
        return { data: {}, error: err("Falha ao enviar o e-mail.") };
      }
    },

    /** Troca o token do link (reset/convite) por uma sessão. */
    async verifyOtp({ token_hash }: { type?: string; token_hash: string }) {
      const db = await getDb();
      const id = await sha256Hex(token_hash);
      const row = (await db
        .prepare(
          `UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?
           RETURNING user_id, kind`,
        )
        .bind(nowIso(), id, nowIso())
        .first()) as { user_id: string; kind: string } | null;
      if (!row) return { data: { user: null, session: null }, error: err("Token has expired or is invalid", 403) };
      await db
        .prepare("UPDATE auth_users SET email_confirmed_at = coalesce(email_confirmed_at, ?) WHERE id = ?")
        .bind(nowIso(), row.user_id)
        .run();
      await startSession(cookies, row.user_id, "recovery");
      return { data: { user: null, session: {} }, error: ok };
    },

    async exchangeCodeForSession(code: string) {
      return this.verifyOtp({ token_hash: code });
    },

    async updateUser(attrs: { password?: string; data?: Record<string, unknown> }) {
      const user = await userBySessionToken(currentToken());
      if (!user) return { data: { user: null }, error: err("Auth session missing!", 401) };
      const db = await getDb();
      if (attrs.password) {
        await db.prepare("UPDATE auth_users SET password_hash = ? WHERE id = ?").bind(await hashPassword(attrs.password), user.id).run();
        // Senha nova derruba as outras sessões.
        await db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND id <> ?").bind(user.id, await sha256Hex(currentToken()!)).run();
      }
      if (attrs.data) {
        await db
          .prepare("UPDATE auth_users SET user_metadata = ? WHERE id = ?")
          .bind(JSON.stringify({ ...user.user_metadata, ...attrs.data }), user.id)
          .run();
      }
      return { data: { user }, error: ok };
    },

    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },

    admin: {
      async listUsers(opts?: { page?: number; perPage?: number }) {
        const per = opts?.perPage ?? 50;
        const page = Math.max(1, opts?.page ?? 1);
        const db = await getDb();
        const r = await db
          .prepare("SELECT * FROM auth_users ORDER BY created_at ASC LIMIT ? OFFSET ?")
          .bind(per, (page - 1) * per)
          .all();
        const users = ((r.results ?? []) as Record<string, unknown>[]).map(toUser);
        return { data: { users }, error: ok };
      },

      async createUser(input: { email: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) {
        try {
          const db = await getDb();
          const row = (await db
            .prepare(
              `INSERT INTO auth_users (email, password_hash, user_metadata, email_confirmed_at)
               VALUES (?, ?, ?, ?) RETURNING *`,
            )
            .bind(
              input.email.trim(),
              input.password ? await hashPassword(input.password) : null,
              JSON.stringify(input.user_metadata ?? {}),
              input.email_confirm ? nowIso() : null,
            )
            .first()) as Record<string, unknown>;
          return { data: { user: toUser(row) }, error: ok };
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          return { data: { user: null }, error: err(/UNIQUE/.test(m) ? "A user with this email address has already been registered" : m) };
        }
      },

      async deleteUser(id: string) {
        const db = await getDb();
        await db.prepare("DELETE FROM auth_users WHERE id = ?").bind(id).run();
        return { data: {}, error: ok };
      },

      async inviteUserByEmail(email: string, opts?: { redirectTo?: string }) {
        try {
          const db = await getDb();
          let row = (await db
            .prepare("SELECT id, email FROM auth_users WHERE email = ? COLLATE NOCASE")
            .bind(email.trim())
            .first()) as { id: string; email: string } | null;
          if (!row) {
            row = (await db
              .prepare("INSERT INTO auth_users (email) VALUES (?) RETURNING id, email")
              .bind(email.trim())
              .first()) as { id: string; email: string };
          }
          await issueLink(row.id, row.email, "invite", opts?.redirectTo ?? inviteRedirect());
          return { data: { user: row }, error: ok };
        } catch (e) {
          return { data: { user: null }, error: err(e instanceof Error ? e.message : String(e)) };
        }
      },
    },
  };
}
