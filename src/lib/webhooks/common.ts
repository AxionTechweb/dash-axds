import "server-only";

import { z } from "zod";

import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

import { validAdId } from "./parse";
import type { PurchaseStatus } from "./status";

// Helpers puros de parsing vivem em ./parse (testáveis fora do Next).
export { firstNumber, firstString, get, safeEqual, validAdId } from "./parse";

/* ------------------------------------------------------------------- área */

export type WebhookAreaSecret = {
  areaId: string;
  /** Segredo já decifrado; null quando ainda não foi configurado no painel. */
  secret: string | null;
};

/**
 * Resolve a área pelo token público da URL e devolve o segredo do webhook
 * já decifrado.
 *
 * IMPORTANTE: o token da URL serve apenas para ROTEAR o webhook até a área
 * certa. A AUTENTICAÇÃO é sempre pelo mecanismo nativo da plataforma
 * (hottok da Hotmart / assinatura HMAC da Kiwify).
 */
export async function resolveWebhookArea(
  token: string,
  field: "hotmart_hottok" | "kiwify_webhook_token",
): Promise<WebhookAreaSecret | null> {
  try {
    const admin = createAdminClient();

    const { data: area } = await admin
      .from("areas")
      .select("id")
      .eq("public_token", token)
      .maybeSingle();

    if (!area) return null;

    const { data: settings } = await admin
      .from("settings")
      .select("hotmart_hottok, kiwify_webhook_token")
      .eq("area_id", area.id)
      .maybeSingle();

    const cipher = settings?.[field] as string | null | undefined;
    if (!cipher) return { areaId: area.id, secret: null };

    return { areaId: area.id, secret: await decryptSecret(cipher) };
  } catch (err) {
    console.error("[webhook] falha ao resolver área/segredo:", err);
    return null;
  }
}

/* --------------------------------------------------------------- gravação */

export type PurchaseInput = {
  areaId: string;
  transactionId: string;
  plataforma: "hotmart" | "kiwify";
  status: PurchaseStatus;
  userId: string | null;
  email: string | null;
  telefone: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  adId: string | null;
  raw: unknown;
};

/** Limites defensivos do que efetivamente é gravado em `purchases`. */
const PurchaseInputSchema = z.object({
  areaId: z.uuid(),
  transactionId: z.string().min(1).max(120),
  plataforma: z.enum(["hotmart", "kiwify"]),
  status: z.enum([
    "approved",
    "pending",
    "refunded",
    "chargeback",
    "canceled",
  ]),
  userId: z.string().max(64).nullable(),
  email: z.string().max(320).nullable(),
  telefone: z.string().max(32).nullable(),
  produto: z.string().max(255).nullable(),
  // Valores absurdos/NaN não entram (protege as métricas do painel).
  valor: z.number().finite().min(0).max(10_000_000).nullable(),
  moeda: z.string().max(8).nullable(),
  adId: z.string().regex(/^\d{5,25}$/).nullable(),
  raw: z.unknown(),
});

type VisitorRow = {
  user_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
};

const VISITOR_COLUMNS =
  "user_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, geo_country, geo_region, geo_city";

/** Só dígitos, para casar telefone em formatos diferentes. */
function phoneDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

/**
 * Casa a compra com um visitante: primeiro por user_id (sck), depois por
 * e-mail e por telefone. Devolve o visitante e COMO ele foi encontrado.
 */
async function matchVisitor(
  areaId: string,
  userId: string | null,
  email: string | null,
  telefone: string | null,
): Promise<{ visitor: VisitorRow | null; match: string }> {
  const admin = createAdminClient();

  if (userId) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "user_id" };
  }

  if (email) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .ilike("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "email" };
  }

  const digits = phoneDigits(telefone);
  if (digits) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .ilike("telefone", `%${digits}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "telefone" };
  }

  return { visitor: null, match: "none" };
}

/**
 * UPSERT idempotente da compra (chave: transaction_id), já vinculada ao
 * visitante quando possível.
 *
 * Fallback de atribuição: se o webhook não trouxer ad_id, usa o utm_content do
 * visitante casado. Compras sem ad_id contam como orgânico/direto — nunca somem.
 */
export async function savePurchase(input: PurchaseInput): Promise<void> {
  // Validação (zod) dos campos JÁ EXTRAÍDOS. Impor schema ao payload bruto seria
  // frágil — cada plataforma muda o formato entre versões —, então validamos o
  // que de fato vai para o banco: tamanhos, tipos e faixas.
  const parsed = PurchaseInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Payload de compra inválido: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`,
    );
  }
  const clean = parsed.data;

  const admin = createAdminClient();

  const { visitor, match } = await matchVisitor(
    clean.areaId,
    clean.userId,
    clean.email,
    clean.telefone,
  );

  const adId = clean.adId ?? validAdId(visitor?.utm_content ?? null);

  const { error } = await admin.from("purchases").upsert(
    {
      area_id: clean.areaId,
      transaction_id: clean.transactionId,
      user_id: clean.userId ?? visitor?.user_id ?? null,
      email: clean.email,
      telefone: clean.telefone,
      produto: clean.produto,
      valor: clean.valor,
      moeda: clean.moeda,
      status: clean.status,
      plataforma: clean.plataforma,
      utm_source: visitor?.utm_source ?? null,
      utm_medium: visitor?.utm_medium ?? null,
      utm_campaign: visitor?.utm_campaign ?? null,
      utm_term: visitor?.utm_term ?? null,
      utm_content: visitor?.utm_content ?? null,
      ad_id: adId,
      geo_country: visitor?.geo_country ?? null,
      geo_region: visitor?.geo_region ?? null,
      geo_city: visitor?.geo_city ?? null,
      match,
      raw_webhook: clean.raw as Record<string, unknown>,
    },
    { onConflict: "transaction_id" },
  );

  if (error) throw error;
}
