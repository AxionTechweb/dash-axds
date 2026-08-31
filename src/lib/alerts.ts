import "server-only";

import { accountStatusLabel } from "@/lib/meta/accounts";
import { getAccountStatus, getAdAccounts, getAdReviewStatuses } from "@/lib/meta/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyArea } from "@/lib/whatsapp/client";

/**
 * Motor dos avisos de WhatsApp — chamado pelo cron externo (mesmo esquema do
 * checkpoint diário, precisa rodar a cada ~15min). Gatilhos:
 *  1. Nenhuma venda aprovada nos últimos 60 minutos.
 *  2. Conta de anúncio desativada na Meta (account_status != 1).
 *  3. Criativo reprovado na Meta (effective_status = DISAPPROVED), com o
 *     motivo da reprovação.
 * (O quarto gatilho — Regra de automação pausando algo — vive dentro do
 * próprio motor de Regras, src/lib/rules/engine.ts, porque é lá que a pausa
 * acontece de fato.)
 *
 * `notifyArea` já é um no-op silencioso se a área não tem WhatsApp conectado
 * — nenhuma das checagens aqui precisa saber disso.
 */

const NO_SALES_THRESHOLD_MS = 60 * 60 * 1000;

async function checkNoSalesAlert(areaId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: lastSale } = await admin
    .from("purchases")
    .select("created_at")
    .eq("area_id", areaId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSaleAt = lastSale?.created_at ? new Date(lastSale.created_at as string) : null;
  const now = new Date();
  const inDrought = !lastSaleAt || now.getTime() - lastSaleAt.getTime() >= NO_SALES_THRESHOLD_MS;
  if (!inDrought) return;

  const { data: state } = await admin
    .from("alert_state")
    .select("last_alerted_at")
    .eq("area_id", areaId)
    .eq("alert_type", "no_sales")
    .maybeSingle();

  const lastAlertedAt = state?.last_alerted_at ? new Date(state.last_alerted_at as string) : null;

  // Já alertou para ESTA seca (nenhuma venda nova desde então)? Não repete a
  // cada execução do cron — só quando uma venda nova acontece e a seca
  // recomeça depois é que vale alertar de novo.
  if (lastAlertedAt && (!lastSaleAt || lastAlertedAt.getTime() >= lastSaleAt.getTime())) {
    return;
  }

  const message = lastSaleAt
    ? `⚠️ Nenhuma venda aprovada há ${Math.floor((now.getTime() - lastSaleAt.getTime()) / 60_000)} minutos.`
    : `⚠️ Nenhuma venda aprovada registrada ainda.`;

  await notifyArea(areaId, message);

  await admin
    .from("alert_state")
    .upsert(
      { area_id: areaId, alert_type: "no_sales", last_alerted_at: now.toISOString() },
      { onConflict: "area_id,alert_type" },
    );
}

async function checkAccountStatusAlerts(areaId: string): Promise<void> {
  const admin = createAdminClient();
  const accounts = await getAdAccounts(areaId);
  if (accounts.length === 0) return;

  for (const account of accounts) {
    if (!account.ads_token) continue;

    const { data: row } = await admin
      .from("meta_ad_accounts")
      .select("last_known_status")
      .eq("id", account.id)
      .maybeSingle();
    const previousStatus = (row?.last_known_status as number | null | undefined) ?? null;

    const result = await getAccountStatus(account.ads_token, account.ad_account_id);
    // Erro de rede/token não é uma transição de status — não alerta por isso.
    if (result.error || result.status === null) continue;

    const wasActive = previousStatus === null || previousStatus === 1;
    const isActive = result.status === 1;

    if (wasActive && !isActive) {
      const label = accountStatusLabel(result.status) ?? `status ${result.status}`;
      await notifyArea(
        areaId,
        `🚫 Conta de anúncio "${account.label}" foi desativada na Meta (${label}). As campanhas dessa conta pararam de rodar.`,
      );
    }

    await admin
      .from("meta_ad_accounts")
      .update({ last_known_status: result.status })
      .eq("id", account.id);
  }
}

/**
 * Reusa a tabela genérica `alert_state` (mesmo esquema do comentário original
 * dela: "account_status:act_123") com `alert_type = "ad_rejected:<ad_id>"` —
 * dedup por status ARMAZENADO em `last_state.status`, sem precisar de tabela
 * nova só pra isso. Só grava linha pra anúncio que JÁ foi ou está reprovado
 * (a maioria nunca é, e não vale a pena gravar uma linha por anúncio da
 * conta inteira).
 */
async function checkAdRejectionAlerts(areaId: string): Promise<void> {
  const admin = createAdminClient();
  const accounts = await getAdAccounts(areaId);
  if (accounts.length === 0) return;

  const { data: stateRows } = await admin
    .from("alert_state")
    .select("alert_type, last_state")
    .eq("area_id", areaId)
    .like("alert_type", "ad_rejected:%");

  const previousStatusByAdId = new Map<string, string | null>();
  for (const row of stateRows ?? []) {
    const adId = (row.alert_type as string).slice("ad_rejected:".length);
    const status = (row.last_state as { status?: string } | null)?.status ?? null;
    previousStatusByAdId.set(adId, status);
  }

  for (const account of accounts) {
    if (!account.ads_token) continue;

    const result = await getAdReviewStatuses(account.ads_token, account.ad_account_id);
    // Erro de rede/token não é uma transição de status — não alerta por isso.
    if (result.error) continue;

    for (const ad of result.data) {
      const isRejectedNow = ad.effectiveStatus === "DISAPPROVED";
      const wasRejected = previousStatusByAdId.get(ad.id) === "DISAPPROVED";
      if (isRejectedNow === wasRejected) continue; // sem mudança de estado

      if (isRejectedNow) {
        const reason = ad.reason ?? "motivo não especificado pela Meta.";
        await notifyArea(
          areaId,
          `🚫 Criativo reprovado na Meta — "${ad.name}" (${account.label}).\nMotivo: ${reason}`,
        );
      }

      await admin.from("alert_state").upsert(
        {
          area_id: areaId,
          alert_type: `ad_rejected:${ad.id}`,
          ...(isRejectedNow ? { last_alerted_at: new Date().toISOString() } : {}),
          last_state: { status: ad.effectiveStatus, reason: ad.reason ?? null },
        },
        { onConflict: "area_id,alert_type" },
      );
    }
  }
}

export type AlertsAreaResult = { areaId: string; errors: string[] };

export async function runAlertsForAllAreas(): Promise<AlertsAreaResult[]> {
  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return [];

  const results: AlertsAreaResult[] = [];
  for (const area of areas) {
    const areaId = area.id as string;
    const errors: string[] = [];

    try {
      await checkNoSalesAlert(areaId);
    } catch (err) {
      errors.push(`no_sales: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }

    try {
      await checkAccountStatusAlerts(areaId);
    } catch (err) {
      errors.push(`account_status: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }

    try {
      await checkAdRejectionAlerts(areaId);
    } catch (err) {
      errors.push(`ad_rejection: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }

    results.push({ areaId, errors });
  }

  return results;
}
