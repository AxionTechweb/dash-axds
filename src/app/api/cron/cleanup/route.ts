import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/capture";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/cleanup — limpeza das janelas antigas do rate limit.
 * Protegido pelo CRON_SECRET (falha fechada se não estiver configurado).
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("rate_limit_cleanup", {
      p_older_than_seconds: 3600,
    });
    if (error) throw error;

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("[cron/cleanup] falha:", err);
    return json({ error: "cleanup_failed" }, 500);
  }
}
