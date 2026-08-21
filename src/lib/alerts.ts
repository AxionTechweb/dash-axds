import "server-only";

import { accountStatusLabel } from "@/lib/meta/accounts";
import { getAccountStatus, getAdAccounts } from "@/lib/meta/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyArea } from "@/lib/whatsapp/client";

/**
 * Motor dos avisos de WhatsApp — chamado pelo cron externo (mesmo esquema do
 * checkpoint diário, precisa rodar a cada ~15min). Dois gatilhos:
 *  1. Nenhuma venda aprovada nos últimos 60 minutos.
 *  2. Conta de anúncio desativada na Meta (account_status != 1).
 * (O terceiro gatilho — Regra de automação pausando algo — vive dentro do
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

    results.push({ areaId, errors });
  }

  return results;
}
