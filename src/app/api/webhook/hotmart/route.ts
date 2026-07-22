import { json } from "@/lib/capture";
import { rateLimit } from "@/lib/rate-limit";
import {
  firstNumber,
  firstString,
  resolveWebhookArea,
  safeEqual,
  savePurchase,
  validAdId,
} from "@/lib/webhooks/common";
import { mapHotmartStatus } from "@/lib/webhooks/status";

/**
 * POST /api/webhook/hotmart?a=<public_token_da_area>
 *
 * Autenticação: header `x-hotmart-hottok`, comparado em tempo constante com o
 * hottok cifrado nas settings da área. O token na URL só ROTEIA para a área.
 *
 * NADA é enviado para Meta/GA4 aqui — apenas gravamos a compra.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("a") ?? "";
  if (!token) return json({ error: "missing_area_token" }, 400);

  // Rate limit generoso: não pode derrubar rajadas legítimas da plataforma.
  if (!(await rateLimit(`webhook:hotmart:${token}`, 600, 60))) {
    return json({ error: "rate_limited" }, 429);
  }

  const area = await resolveWebhookArea(token, "hotmart_hottok");
  if (!area) return json({ error: "area_not_found" }, 404);

  if (!area.secret) {
    return json({ error: "hottok_not_configured" }, 503);
  }

  const hottok = request.headers.get("x-hotmart-hottok") ?? "";
  if (!hottok || !safeEqual(hottok, area.secret)) {
    return json({ error: "invalid_hottok" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const transactionId = firstString(payload, [
    "data.purchase.transaction",
    "data.purchase.transaction_id",
    "data.transaction",
    "transaction",
  ]);

  if (!transactionId) {
    // Sem chave de idempotência não dá para gravar; 200 evita reenvio infinito.
    console.warn("[webhook/hotmart] payload sem transaction id");
    return json({ ok: true, ignored: "missing_transaction" }, 200);
  }

  const status = mapHotmartStatus(
    firstString(payload, ["data.purchase.status", "data.status", "status"]),
    firstString(payload, ["event"]),
  );

  // Rastreio: user_id no `sck`, ad_id no `src`.
  const userId = firstString(payload, [
    "data.purchase.origin.sck",
    "data.purchase.sck",
    "data.origin.sck",
  ]);
  const adId = validAdId(
    firstString(payload, [
      "data.purchase.origin.src",
      "data.purchase.src",
      "data.origin.src",
    ]),
  );

  try {
    await savePurchase({
      areaId: area.areaId,
      transactionId,
      plataforma: "hotmart",
      status,
      userId,
      email: firstString(payload, ["data.buyer.email", "data.subscriber.email"]),
      telefone: firstString(payload, [
        "data.buyer.checkout_phone",
        "data.buyer.phone",
      ]),
      produto: firstString(payload, ["data.product.name", "data.product.id"]),
      valor: firstNumber(payload, [
        "data.purchase.price.value",
        "data.purchase.full_price.value",
        "data.purchase.original_offer_price.value",
      ]),
      moeda: firstString(payload, [
        "data.purchase.price.currency_value",
        "data.purchase.price.currency_code",
        "data.purchase.full_price.currency_value",
      ]),
      adId,
      raw: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhook/hotmart] falha ao gravar compra:", err);

    // Payload inválido é erro PERMANENTE: responder 2xx evita reenvio infinito
    // pela plataforma. Falha de infraestrutura devolve 500 para haver retry.
    if (message.startsWith("Payload de compra inválido")) {
      return json({ ok: true, ignored: "invalid_payload" }, 200);
    }
    return json({ error: "storage_error" }, 500);
  }

  return json({ ok: true }, 200);
}
