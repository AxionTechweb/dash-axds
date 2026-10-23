import { json } from "@/lib/capture";
import { pushPublicKey } from "@/lib/push";

/** GET /api/push/key — chave pública VAPID para o navegador se inscrever. */
export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = pushPublicKey();
  if (!publicKey) return json({ error: "push_not_configured" }, 503);
  return json({ publicKey }, 200);
}
