import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notificações push do PWA (chegam na barra do celular, com o som/vibração
 * padrão do aparelho). Chaves VAPID vivem só no env da Vercel
 * (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT); sem elas, tudo aqui
 * vira no-op silencioso.
 *
 * Painel single-tenant: todo aviso vai para todos os aparelhos inscritos
 * (tabela push_subscriptions). Inscrição expirada (404/410) é apagada.
 * Nunca lança — falha de push não pode derrubar webhook nem cron.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Página aberta ao tocar na notificação. */
  url?: string;
  /** Mesma tag substitui a notificação anterior em vez de empilhar. */
  tag?: string;
};

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@example.com";
  configured = Boolean(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(subject, publicKey!, privateKey!);
  return configured;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(rows: SubscriptionRow[], payload: PushPayload): Promise<number> {
  if (!configure() || rows.length === 0) return 0;
  const admin = createAdminClient();
  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 60 * 60 * 6, urgency: "high" },
        );
        sent += 1;
        await admin
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", row.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Aparelho desinstalou/revogou: a inscrição não volta mais.
          await admin.from("push_subscriptions").delete().eq("id", row.id);
        } else {
          console.error("[push] falha ao enviar:", status ?? err);
        }
      }
    }),
  );
  return sent;
}

/** Envia para TODOS os aparelhos inscritos. Devolve quantos receberam. */
export async function sendPush(payload: PushPayload): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    return await deliver((data ?? []) as SubscriptionRow[], payload);
  } catch (err) {
    console.error("[push] sendPush:", err);
    return 0;
  }
}

/** Envia só para os aparelhos de um usuário (botão "Enviar teste"). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    return await deliver((data ?? []) as SubscriptionRow[], payload);
  } catch (err) {
    console.error("[push] sendPushToUser:", err);
    return 0;
  }
}
