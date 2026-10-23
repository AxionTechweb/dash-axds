import "server-only";

import { formatCurrency } from "@/lib/format";
import { getAreaInsights } from "@/lib/meta/client";
import { getTodayYmdBRT } from "@/lib/period";
import { sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notificações push de NEGÓCIO (vendas, reembolso, meta, resumo das 18h).
 * Os avisos operacionais (conta bloqueada, criativo reprovado, sem venda,
 * PIX, regras) disparam de dentro de src/lib/alerts.ts e src/lib/rules.
 *
 * Tudo aqui roda sem sessão de usuário (webhook/cron) — por isso lê com o
 * service_role, e não com as funções do Dashboard (que exigem login).
 */

type AreaSettings = {
  currency: string;
  taxRate: number;
  gatewayFeePct: number;
  gatewayFeeFixed: number;
  revenueGoal: number;
};

async function loadSettings(areaId: string): Promise<AreaSettings> {
  const { data } = await createAdminClient()
    .from("settings")
    .select("currency, tax_rate, revenue_goal, gateway_fee_pct, gateway_fee_fixed")
    .eq("area_id", areaId)
    .maybeSingle();
  return {
    currency: (data?.currency as string) || "BRL",
    taxRate: Number(data?.tax_rate) || 0,
    gatewayFeePct: Number(data?.gateway_fee_pct) || 0,
    gatewayFeeFixed: Number(data?.gateway_fee_fixed) || 0,
    revenueGoal: Number(data?.revenue_goal) || 0,
  };
}

/** Faturamento e nº de vendas aprovadas no intervalo (service_role). */
async function approvedTotals(areaId: string, from: Date, to: Date) {
  const { data } = await createAdminClient()
    .from("purchases")
    .select("valor")
    .eq("area_id", areaId)
    .eq("status", "approved")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .limit(20_000);
  const rows = data ?? [];
  return { revenue: rows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0), sales: rows.length };
}

/** Grava o aviso em alert_state; devolve false se esse aviso já foi dado. */
async function claimOnce(areaId: string, alertType: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("alert_state")
    .insert({ area_id: areaId, alert_type: alertType, last_alerted_at: new Date().toISOString() });
  return !error; // conflito na PK (area_id, alert_type) = já avisado
}

const brtDayStart = (ymd: string) => new Date(`${ymd}T03:00:00.000Z`);

/* ------------------------------------------------------- venda / reembolso */

/**
 * Chamado pelo webhook de compra DEPOIS de gravar. Só avisa quando o status
 * MUDA (webhook reenviado com o mesmo status não repete a notificação).
 */
export async function notifyPurchaseChange(input: {
  areaId: string;
  previousStatus: string | null;
  status: string;
  valor: number | null;
  moeda: string | null;
  produto: string | null;
}): Promise<void> {
  if (input.status === input.previousStatus) return;
  const value = formatCurrency(Number(input.valor) || 0, input.moeda || "BRL");
  const product = input.produto ? ` · ${input.produto}` : "";

  if (input.status === "approved") {
    await sendPush({ title: "💰 Venda aprovada", body: `${value}${product}`, url: "/vendas" });
    await checkMonthlyGoal(input.areaId);
  } else if (input.status === "refunded") {
    await sendPush({ title: "↩️ Reembolso", body: `${value}${product}`, url: "/vendas" });
  } else if (input.status === "chargeback") {
    await sendPush({ title: "⚠️ Chargeback", body: `${value}${product}`, url: "/vendas" });
  }
}

/* ------------------------------------------------------------ meta do mês */

async function checkMonthlyGoal(areaId: string): Promise<void> {
  const settings = await loadSettings(areaId);
  if (settings.revenueGoal <= 0) return;

  const ymd = getTodayYmdBRT();
  const { revenue } = await approvedTotals(areaId, brtDayStart(`${ymd.slice(0, 7)}-01`), new Date());
  if (revenue < settings.revenueGoal) return;

  if (await claimOnce(areaId, `goal:${ymd.slice(0, 7)}`)) {
    await sendPush({
      title: "🎯 Meta do mês batida!",
      body: `${formatCurrency(revenue, settings.currency)} de ${formatCurrency(settings.revenueGoal, settings.currency)}. Bora pra próxima.`,
      url: "/dashboard",
      tag: "monthly-goal",
    });
  }
}

/* ------------------------------------------------------- resumo das 18h */

/** Frases do resumo — {v} vira o lucro formatado. */
export const PROFIT_PHRASES = [
  "Você lucrou {v} hoje. A janta é por sua conta 🍽️",
  "{v} de lucro hoje. Pode pedir aquela pizza sem culpa 🍕",
  "Dia fechado com {v} no bolso. Merece um happy hour 🍻",
  "Lucro de hoje: {v}. Já paga o mercado da semana 🛒",
  "{v} de lucro hoje. Descansa que o anúncio trabalha por você 😎",
];
export const LOSS_PHRASE = "Hoje fechou em {v}. Amanhã a gente vira o jogo 💪";

/** Lucro do dia (mesma fórmula do Dashboard) e notificação com frase. */
export async function sendDailySummary(areaId: string): Promise<{ sent: boolean; profit: number }> {
  const ymd = getTodayYmdBRT();
  if (!(await claimOnce(areaId, `daily_summary:${ymd}`))) return { sent: false, profit: 0 };

  const from = brtDayStart(ymd);
  const to = new Date();
  const [settings, totals, meta] = await Promise.all([
    loadSettings(areaId),
    approvedTotals(areaId, from, to),
    getAreaInsights(areaId, from, to),
  ]);

  const adSpend = meta.insights.spend;
  const tax = totals.revenue * (settings.taxRate / 100);
  const gateway = totals.revenue * (settings.gatewayFeePct / 100) + settings.gatewayFeeFixed * totals.sales;
  const profit = totals.revenue - adSpend - tax - gateway;

  const value = formatCurrency(profit, settings.currency);
  const phrase =
    profit >= 0
      ? PROFIT_PHRASES[Math.floor(Math.random() * PROFIT_PHRASES.length)]
      : LOSS_PHRASE;

  await sendPush({
    title: "📊 Resumo do dia",
    body: `${phrase.replace("{v}", value)}\n${totals.sales} venda(s) · Gasto ${formatCurrency(adSpend, settings.currency)}`,
    url: "/dashboard",
    tag: `daily-summary-${ymd}`,
  });
  return { sent: true, profit };
}

/* --------------------------------------- sem venda há 2h com anúncio gastando */

const NO_SALES_PUSH_MS = 2 * 60 * 60 * 1000;

function brtHourNow(): number {
  const h = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false });
  return Number(h.replace(/\D/g, "")) % 24;
}

/**
 * Push quando passa 2h sem venda aprovada E a conta gastou hoje (anúncio
 * rodando). Só entre 8h e 23h (horário de Brasília) para não acordar
 * ninguém. Avisa uma vez por "seca": só repete depois de uma venda nova.
 */
export async function checkNoSalesPush(areaId: string): Promise<void> {
  const hour = brtHourNow();
  if (hour < 8 || hour >= 23) return;

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
  if (lastSaleAt && Date.now() - lastSaleAt.getTime() < NO_SALES_PUSH_MS) return;

  const { data: state } = await admin
    .from("alert_state")
    .select("last_alerted_at")
    .eq("area_id", areaId)
    .eq("alert_type", "no_sales_push")
    .maybeSingle();
  const lastAlertedAt = state?.last_alerted_at ? new Date(state.last_alerted_at as string) : null;
  if (lastAlertedAt && (!lastSaleAt || lastAlertedAt >= lastSaleAt)) return;

  const ymd = getTodayYmdBRT();
  const meta = await getAreaInsights(areaId, brtDayStart(ymd), new Date());
  if (meta.insights.spend <= 0) return; // sem anúncio gastando, não é alarme

  const hours = lastSaleAt ? Math.floor((Date.now() - lastSaleAt.getTime()) / 3_600_000) : null;
  await sendPush({
    title: "⏳ Sem vendas",
    body: hours
      ? `Nenhuma venda há ${hours}h e os anúncios já gastaram ${formatCurrency(meta.insights.spend)} hoje.`
      : `Nenhuma venda registrada e os anúncios já gastaram ${formatCurrency(meta.insights.spend)} hoje.`,
    url: "/campanhas",
    tag: "no-sales",
  });

  await admin
    .from("alert_state")
    .upsert(
      { area_id: areaId, alert_type: "no_sales_push", last_alerted_at: new Date().toISOString() },
      { onConflict: "area_id,alert_type" },
    );
}
