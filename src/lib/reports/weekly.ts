import "server-only";

import { getWeeklySalesByAdAndTier } from "@/lib/attribution";
import { withCurrencyTag } from "@/lib/format";
import { getMetaEntities } from "@/lib/meta/campaigns";
import { META_AD_TAX_RATE } from "@/lib/meta/config";
import { getLastWeekRange } from "@/lib/period";
import { type CreativeReportRow, writeWeeklyReportToSheet } from "@/lib/sheets/writer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVturbByAd } from "@/lib/vturb/metrics";

/**
 * Orquestrador do relatório semanal por criativo — junta Meta (spend/
 * impressions/clicks, já automatizado), Vturb (hook/play/retenção do pitch,
 * Fase B) e vendas próprias por tier (Fase C, attribution.ts), calcula ROAS/
 * CAC/margem líquida e grava em `creative_reports` (upsert idempotente por
 * área+semana+ad_id — reprocessar a mesma semana atualiza, não duplica).
 *
 * Mesma fórmula de lucro já usada no Dashboard (src/app/(panel)/dashboard/
 * page.tsx): receita − gasto − imposto da Meta sobre o gasto
 * (META_AD_TAX_RATE) − imposto sobre faturamento (settings.tax_rate) — aqui
 * também descontando a taxa de gateway configurável.
 *
 * `campaign_id`/`campaign_name` ficam nulos nesta versão: getMetaEntities
 * agrega os insights por ad_id e não repassa a campanha de origem — dá pra
 * estender depois se fizer falta no relatório.
 */

export type BuildWeeklyReportResult = {
  rowsWritten: number;
  errors: string[];
};

type ReportSettings = {
  taxRate: number;
  gatewayFeePct: number;
  gatewayFeeFixed: number;
};

/**
 * Lê as taxas da área via client ADMIN (cron não tem sessão de usuário nos
 * cookies — a SSR `getSettings` de src/lib/settings.ts devolveria null).
 */
async function getReportSettings(areaId: string): Promise<ReportSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("tax_rate, gateway_fee_pct, gateway_fee_fixed")
    .eq("area_id", areaId)
    .maybeSingle();

  return {
    taxRate: Number(data?.tax_rate) || 0,
    gatewayFeePct: Number(data?.gateway_fee_pct) || 0,
    gatewayFeeFixed: Number(data?.gateway_fee_fixed) || 0,
  };
}

export async function buildWeeklyReport(
  areaId: string,
  weekStart: Date,
  weekEnd: Date,
  weekStartYmd: string,
  weekEndYmd: string,
): Promise<BuildWeeklyReportResult> {
  const errors: string[] = [];

  const [meta, vturb, sales, settings] = await Promise.all([
    getMetaEntities(areaId, "ad", weekStart, weekEnd),
    getVturbByAd(areaId, weekStart, weekEnd),
    getWeeklySalesByAdAndTier(areaId, weekStart, weekEnd),
    getReportSettings(areaId),
  ]);

  errors.push(...meta.errors, ...vturb.errors);

  // Sem filtro de STATUS: todo criativo que gastou/teve insight na semana
  // entra, independente do status atual — é um relatório histórico, e até
  // segunda a maioria dos criativos de uma semana fechada já foi pausada ou
  // trocada (confirmado com o usuário: pausado/rejeitado depois não deve
  // sumir do relatório da semana em que rodou).
  //
  // COM filtro de ATIVIDADE: `getMetaEntities` traz TODO anúncio que existe
  // na conta (até 500, via /act_X/ads), não só os com insight no período —
  // um anúncio velho sem gasto nenhum na semana ainda ganhava uma linha
  // zerada. Aqui descarta quem não teve gasto nem impressão de verdade.
  const activeEntities = meta.rows.filter(
    (entity) => entity.spend > 0 || entity.impressions > 0,
  );

  if (activeEntities.length === 0) {
    return { rowsWritten: 0, errors };
  }

  const rows = activeEntities.map((entity) => {
    const adId = entity.id; // no nível "ad", o id da entidade É o ad_id.
    const vturbRow = vturb.byAd.get(adId) ?? null;
    const salesRow = sales.get(adId) ?? null;

    const salesTotal = salesRow?.sales ?? 0;
    const revenueTotal = salesRow?.revenue ?? 0;

    const metaTax = entity.spend * META_AD_TAX_RATE;
    const platformTax = revenueTotal * (settings.taxRate / 100);
    const gatewayFees =
      revenueTotal * (settings.gatewayFeePct / 100) +
      settings.gatewayFeeFixed * salesTotal;
    const netMargin = revenueTotal - entity.spend - metaTax - platformTax - gatewayFees;

    return {
      area_id: areaId,
      week_start: weekStartYmd,
      week_end: weekEndYmd,
      account_id: entity.accountId,
      account_label: withCurrencyTag(entity.accountLabel, entity.accountCurrency),
      ad_id: adId,
      ad_name: entity.name,
      campaign_id: null,
      campaign_name: null,
      status: entity.effectiveStatus || entity.status,
      spend: entity.spend,
      impressions: entity.impressions,
      clicks: entity.clicks,
      page_views: entity.metaLandingPageView,
      initiate_checkout: entity.metaInitiateCheckout,
      meta_purchases: entity.metaPurchases,
      meta_revenue: entity.metaRevenue,
      vturb_player_id: vturbRow?.playerId ?? null,
      hook_rate: vturbRow?.hookRate ?? null,
      play_rate: vturbRow?.playRate ?? null,
      plays: vturbRow?.plays ?? null,
      pitch_retention: vturbRow?.pitchRetention ?? null,
      cta_clicks: vturbRow?.ctaClicks ?? null,
      sales_vd: salesRow?.byTier.vd.sales ?? 0,
      revenue_vd: salesRow?.byTier.vd.revenue ?? 0,
      sales_upsell: salesRow?.byTier.upsell.sales ?? 0,
      revenue_upsell: salesRow?.byTier.upsell.revenue ?? 0,
      sales_downsell: salesRow?.byTier.downsell.sales ?? 0,
      revenue_downsell: salesRow?.byTier.downsell.revenue ?? 0,
      sales_total: salesTotal,
      revenue_total: revenueTotal,
      roas: entity.spend > 0 ? revenueTotal / entity.spend : 0,
      cac: salesTotal > 0 ? entity.spend / salesTotal : 0,
      net_margin: netMargin,
      delta_meta_vs_own: entity.metaPurchases - salesTotal,
    };
  });

  const admin = createAdminClient();
  const { error } = await admin
    .from("creative_reports")
    .upsert(rows, { onConflict: "area_id,week_start,ad_id" });

  if (error) errors.push(`creative_reports: ${error.message}`);

  return { rowsWritten: error ? 0 : rows.length, errors };
}

const CREATIVE_REPORT_SHEET_COLUMNS =
  "account_label, ad_id, ad_name, status, spend, impressions, clicks, page_views, " +
  "initiate_checkout, meta_purchases, hook_rate, plays, play_rate, pitch_retention, " +
  "cta_clicks, sales_vd, sales_upsell, sales_downsell, sales_total, revenue_total, " +
  "roas, cac, net_margin, delta_meta_vs_own";

export type WeeklyReportRunSummary = {
  areaId: string;
  rowsWritten: number;
  sheetOk: boolean;
  sheetError?: string;
  errors: string[];
};

/**
 * Roda o relatório da semana Seg–Dom que acabou de fechar para TODAS as
 * áreas — chamado pelo cron semanal. Cada área é isolada em try/catch: uma
 * falha (ex.: Meta fora do ar numa área) não derruba as demais. A escrita no
 * Sheets é tentada mesmo quando a integração não está configurada — o erro
 * fica registrado em `weekly_report_runs` para dar visibilidade, sem quebrar
 * o cron.
 */
export async function runWeeklyReportForAllAreas(): Promise<WeeklyReportRunSummary[]> {
  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return [];

  const { weekStart, weekEnd, weekStartYmd, weekEndYmd } = getLastWeekRange();
  const summaries: WeeklyReportRunSummary[] = [];

  for (const area of areas) {
    const areaId = area.id as string;

    try {
      const built = await buildWeeklyReport(
        areaId,
        weekStart,
        weekEnd,
        weekStartYmd,
        weekEndYmd,
      );

      let sheetOk = false;
      let sheetError: string | undefined;

      if (built.rowsWritten > 0) {
        const { data: rows } = await admin
          .from("creative_reports")
          .select(CREATIVE_REPORT_SHEET_COLUMNS)
          .eq("area_id", areaId)
          .eq("week_start", weekStartYmd);

        const sheetResult = await writeWeeklyReportToSheet(
          areaId,
          weekStartYmd,
          weekEndYmd,
          (rows ?? []) as unknown as CreativeReportRow[],
        );
        sheetOk = sheetResult.ok;
        if (!sheetResult.ok) sheetError = sheetResult.error;
      }

      summaries.push({ areaId, rowsWritten: built.rowsWritten, sheetOk, sheetError, errors: built.errors });

      await admin.from("audit_log").insert({
        area_id: areaId,
        actor_email: null, // execução automática (cron)
        action: "report.weekly_run",
        target_type: "creative_reports",
        details: {
          week_start: weekStartYmd,
          week_end: weekEndYmd,
          rows_written: built.rowsWritten,
          sheet_ok: sheetOk,
          sheet_error: sheetError ?? null,
          // rowsWritten=0 pode ser "sem anúncio na semana" OU uma falha no
          // upsert (ex.: overflow numérico) — sem isso aqui, a única forma
          // de saber qual era chamar a rota na mão e ler a resposta.
          errors: built.errors,
        },
      });
    } catch (err) {
      summaries.push({
        areaId,
        rowsWritten: 0,
        sheetOk: false,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
