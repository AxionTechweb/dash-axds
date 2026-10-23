import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { json } from "@/lib/capture";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST   /api/push/subscribe — grava a inscrição push deste aparelho.
 * DELETE /api/push/subscribe — remove (botão "Desativar").
 * Exige sessão; a escrita é com service_role, sempre no user_id da sessão.
 */
export const dynamic = "force-dynamic";

const SubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const parsed = SubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_subscription" }, 400);

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
  if (error) return json({ error: "storage_error" }, 500);
  return json({ ok: true }, 200);
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return json({ error: "missing_endpoint" }, 400);

  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint);
  return json({ ok: true }, 200);
}
