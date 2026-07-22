import { createHmac } from "node:crypto";

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
import { mapKiwifyStatus } from "@/lib/webhooks/status";

/**
 * POST /api/webhook/kiwify?a=<public_token_da_area>
 *
 * Autenticação: assinatura HMAC do CORPO BRUTO com o token cifrado nas
 * settings da área. O token na URL só ROTEIA para a área.
 *
 * NADA é enviado para Meta/GA4 aqui — apenas gravamos a compra.
 */

export const dynamic = "force-dynamic";

/**
 * A Kiwify envia a assinatura em `?signature=` (hex). Não foi possível
 * confirmar o algoritmo na doc oficial (página renderizada por JS), então
 * aceitamos sha1 (o mais citado) e sha256. Ambos exigem o segredo, então a
 * verificação continua criptograficamente válida.
 */
function signatureMatches(rawBody: string, secret: string, provided: string) {
  return ["sha1", "sha256"].some((algo) => {
    const digest = createHmac(algo, secret).update(rawBody).digest("hex");
    return safeEqual(digest, provided.toLowerCase());
  });
}

/**
 * A Kiwify envia valores em CENTAVOS (inteiro). Valores fracionários são
 * tratados como já estando na unidade da moeda.
 * O payload bruto fica salvo em raw_webhook para conferência.
 */
function normalizeAmount(value: number | null): number | null {
  if (value === null) return null;
  return Number.isInteger(value) ? value / 100 : value;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("a") ?? "";
  if (!token) return json({ error: "missing_area_token" }, 400);

  if (!(await rateLimit(`webhook:kiwify:${token}`, 600, 60))) {
    return json({ error: "rate_limited" }, 429);
  }

  const area = await resolveWebhookArea(token, "kiwify_webhook_token");
  if (!area) return json({ error: "area_not_found" }, 404);

  if (!area.secret) {
    return json({ error: "webhook_token_not_configured" }, 503);
  }

  const provided =
    url.searchParams.get("signature") ??
    request.headers.get("x-kiwify-signature") ??
    "";

  if (!provided) return json({ error: "missing_signature" }, 401);

  // O HMAC é calculado sobre o corpo BRUTO — ler como texto antes do parse.
  const rawBody = await request.text();

  if (!signatureMatches(rawBody, area.secret, provided)) {
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const transactionId = firstString(payload, [
    "order_id",
    "order_ref",
    "Order.order_id",
  ]);

  if (!transactionId) {
    console.warn("[webhook/kiwify] payload sem order id");
    return json({ ok: true, ignored: "missing_transaction" }, 200);
  }

  const status = mapKiwifyStatus(
    firstString(payload, ["order_status", "Order.order_status", "status"]),
    firstString(payload, ["webhook_event_type", "event"]),
  );

  // Rastreio: user_id em sck (ou s1) e ad_id em utm_content.
  const userId = firstString(payload, [
    "TrackingParameters.sck",
    "TrackingParameters.s1",
    "trackingParameters.sck",
    "trackingParameters.s1",
    "tracking_parameters.sck",
    "tracking_parameters.s1",
  ]);

  const adId = validAdId(
    firstString(payload, [
      "TrackingParameters.utm_content",
      "trackingParameters.utm_content",
      "tracking_parameters.utm_content",
      "TrackingParameters.src",
    ]),
  );

  try {
    await savePurchase({
      areaId: area.areaId,
      transactionId,
      plataforma: "kiwify",
      status,
      userId,
      email: firstString(payload, ["Customer.email", "customer.email"]),
      telefone: firstString(payload, [
        "Customer.mobile",
        "Customer.phone",
        "customer.mobile",
      ]),
      produto: firstString(payload, [
        "Product.product_name",
        "product.product_name",
        "product_name",
      ]),
      valor: normalizeAmount(
        firstNumber(payload, [
          "Commissions.charge_amount",
          "commissions.charge_amount",
          "charge_amount",
        ]),
      ),
      moeda:
        firstString(payload, [
          "Commissions.currency",
          "commissions.currency",
          "currency",
        ]) ?? "BRL",
      adId,
      raw: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhook/kiwify] falha ao gravar compra:", err);

    // Payload inválido é erro PERMANENTE: responder 2xx evita reenvio infinito
    // pela plataforma. Falha de infraestrutura devolve 500 para haver retry.
    if (message.startsWith("Payload de compra inválido")) {
      return json({ ok: true, ignored: "invalid_payload" }, 200);
    }
    return json({ error: "storage_error" }, 500);
  }

  return json({ ok: true }, 200);
}
