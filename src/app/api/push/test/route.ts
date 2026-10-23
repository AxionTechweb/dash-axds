import { getCurrentUser } from "@/lib/auth";
import { json } from "@/lib/capture";
import { sendPushToUser } from "@/lib/push";

/** POST /api/push/test — manda uma notificação de teste só para os aparelhos de quem pediu. */
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const sent = await sendPushToUser(user.id, {
    title: "Notificações ativadas ✅",
    body: "É assim que vão chegar as vendas e os avisos do painel.",
    url: "/dashboard",
    tag: "push-test",
  });
  return json({ ok: true, sent }, 200);
}
