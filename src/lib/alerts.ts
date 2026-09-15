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
 *  4. PIX travado: várias compras em "aguardando pagamento" por mais tempo
 *     do que o PIX normalmente leva pra confirmar ou o cliente desistir —
 *     não existe API gratuita/oficial de status do PIX em tempo real (nem
 *     Downdetector cobre o Brasil, nem os dados abertos do Banco Central são
 *     status ao vivo — só estatística agregada), então o sinal vem de dentro:
 *     a própria operação parando de confirmar PIX é o indício mais direto.
 * (O quinto gatilho — Regra de automação pausando algo — vive dentro do
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

/**
 * Quantas checagens SEGUIDAS precisam ver o problema resolvido antes de
 * rearmar o alerta — descoberto em produção que tanto `account_status`
 * quanto `effective_status` de anúncio podem "piscar" (revisão/apelação em
 * andamento na Meta, ou uma corrida entre execuções do cron externo se
 * sobrepondo). Uma detecção ingênua de transição ("estava ok → não está
 * mais") reage a CADA piscada e manda o mesmo aviso várias vezes por dia —
 * exigir confirmação sustentada filtra isso sem exigir um valor de tempo
 * arbitrário (a cadência real do cron externo pode variar).
 */
const RECOVERY_CONFIRM_CHECKS = 3;

type AlertDedupState = { consecutiveOkChecks?: number };

/**
 * Garante que um alerta binário (ok/problema) — conta desativada, criativo
 * reprovado — dispare exatamente UMA VEZ por episódio, mesmo com o sinal de
 * origem instável: só rearma depois de ver o estado OK se confirmar em
 * `RECOVERY_CONFIRM_CHECKS` execuções seguidas, não na primeira volta ao
 * normal (que pode ser só uma piscada). Devolve `true` quando deve notificar
 * agora; quem chama decide a mensagem e chama `notifyArea`.
 */
async function shouldNotifyOnce(
  admin: ReturnType<typeof createAdminClient>,
  areaId: string,
  alertType: string,
  isProblem: boolean,
): Promise<boolean> {
  const { data: state } = await admin
    .from("alert_state")
    .select("last_state")
    .eq("area_id", areaId)
    .eq("alert_type", alertType)
    .maybeSingle();

  const alreadyAlerted = state !== null;

  if (isProblem) {
    if (!alreadyAlerted) {
      await admin.from("alert_state").upsert(
        {
          area_id: areaId,
          alert_type: alertType,
          last_alerted_at: new Date().toISOString(),
          last_state: { consecutiveOkChecks: 0 } satisfies AlertDedupState,
        },
        { onConflict: "area_id,alert_type" },
      );
      return true;
    }

    // Já alertado — viu o problema de novo, zera qualquer confirmação de
    // recuperação em andamento (não deixa uma piscada de volta ao normal
    // quase completar a contagem e rearmar cedo demais).
    const consecutiveOkChecks = (state.last_state as AlertDedupState | null)?.consecutiveOkChecks ?? 0;
    if (consecutiveOkChecks !== 0) {
      await admin
        .from("alert_state")
        .update({ last_state: { consecutiveOkChecks: 0 } satisfies AlertDedupState })
        .eq("area_id", areaId)
        .eq("alert_type", alertType);
    }
    return false;
  }

  // Está OK agora.
  if (!alreadyAlerted) return false; // nunca alertou — nada a "recuperar"

  const consecutiveOkChecks =
    ((state.last_state as AlertDedupState | null)?.consecutiveOkChecks ?? 0) + 1;

  if (consecutiveOkChecks >= RECOVERY_CONFIRM_CHECKS) {
    // Recuperação confirmada — apaga o estado pra um futuro problema real
    // avisar de novo, em vez de ficar preso ao episódio antigo.
    await admin.from("alert_state").delete().eq("area_id", areaId).eq("alert_type", alertType);
  } else {
    await admin
      .from("alert_state")
      .update({ last_state: { consecutiveOkChecks } satisfies AlertDedupState })
      .eq("area_id", areaId)
      .eq("alert_type", alertType);
  }
  return false;
}

/**
 * PIX normalmente confirma em segundos ou o cliente desiste — ficar em
 * "aguardando pagamento" por mais de 15 minutos é sempre anormal. Exige
 * VÁRIAS compras presas ao mesmo tempo (não só uma), pra não confundir um
 * cliente lento/indeciso isolado com instabilidade de verdade no PIX.
 *
 * A janela tem limite inferior E superior: descoberto em produção que a
 * plataforma de checkout nunca marca um PIX expirado como "abandoned" — o
 * registro fica em `waiting_payment` PRA SEMPRE (achamos 161 assim, o mais
 * recente com quase 30h). Sem o limite de baixo (só olhar "criado há mais de
 * 15min"), esse lixo antigo acumulado dispararia o alerta sempre, falso
 * positivo permanente. Com o limite de cima também, só entra quem foi criado
 * numa janela recente — sinal de problema ACONTECENDO agora, não histórico.
 */
const PIX_STUCK_THRESHOLD_MS = 15 * 60 * 1000;
const PIX_RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const PIX_STUCK_MIN_COUNT = 3;

async function checkPixOutageAlert(areaId: string): Promise<void> {
  const admin = createAdminClient();
  const stuckCutoff = new Date(Date.now() - PIX_STUCK_THRESHOLD_MS);
  const recentWindowStart = new Date(Date.now() - PIX_RECENT_WINDOW_MS);

  const { count, error } = await admin
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("area_id", areaId)
    .eq("payment_method", "PIX")
    .eq("status", "waiting_payment")
    .gte("created_at", recentWindowStart.toISOString())
    .lte("created_at", stuckCutoff.toISOString());

  if (error) return; // falha de leitura não é sinal de PIX travado

  const stuckCount = count ?? 0;
  const isProblem = stuckCount >= PIX_STUCK_MIN_COUNT;

  if (await shouldNotifyOnce(admin, areaId, "pix_outage", isProblem)) {
    await notifyArea(
      areaId,
      `⚠️ ${stuckCount} pagamentos via PIX presos em "aguardando pagamento" há mais de 15 minutos. Pode ser instabilidade no PIX, não só desistência de cliente.\nConfere manualmente aqui: https://downdetector.com.br/en/status/pix/`,
    );
  }
}

async function checkAccountStatusAlerts(areaId: string): Promise<void> {
  const admin = createAdminClient();
  const accounts = await getAdAccounts(areaId);
  if (accounts.length === 0) return;

  for (const account of accounts) {
    if (!account.ads_token || account.alerts_muted) continue;

    const result = await getAccountStatus(account.ads_token, account.ad_account_id);
    // Erro de rede/token não é uma transição de status — não alerta por isso.
    if (result.error || result.status === null) continue;

    const isActive = result.status === 1;
    const alertType = `account_status:${account.ad_account_id}`;

    if (await shouldNotifyOnce(admin, areaId, alertType, !isActive)) {
      const label = accountStatusLabel(result.status) ?? `status ${result.status}`;
      await notifyArea(
        areaId,
        `🚫 Conta de anúncio "${account.label}" foi desativada na Meta (${label}). As campanhas dessa conta pararam de rodar.`,
      );
    }

    // Só pra exibição/depuração — a decisão de alertar não depende mais disso.
    await admin
      .from("meta_ad_accounts")
      .update({ last_known_status: result.status })
      .eq("id", account.id);
  }
}

async function checkAdRejectionAlerts(areaId: string): Promise<void> {
  const admin = createAdminClient();
  const accounts = await getAdAccounts(areaId);
  if (accounts.length === 0) return;

  for (const account of accounts) {
    if (!account.ads_token) continue;

    const result = await getAdReviewStatuses(account.ads_token, account.ad_account_id);
    // Erro de rede/token não é uma transição de status — não alerta por isso.
    if (result.error) continue;

    for (const ad of result.data) {
      const isRejected = ad.effectiveStatus === "DISAPPROVED";
      const alertType = `ad_rejected:${ad.id}`;

      if (await shouldNotifyOnce(admin, areaId, alertType, isRejected)) {
        const reason = ad.reason ?? "motivo não especificado pela Meta.";
        await notifyArea(
          areaId,
          `🚫 Criativo reprovado na Meta — "${ad.name}" (${account.label}).\nMotivo: ${reason}`,
        );
      }
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
      await checkPixOutageAlert(areaId);
    } catch (err) {
      errors.push(`pix_outage: ${err instanceof Error ? err.message : "erro desconhecido"}`);
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
