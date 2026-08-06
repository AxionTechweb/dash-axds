import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getSheetsIntegration, type SheetsIntegration } from "./client";

/**
 * Escreve o relatório semanal numa aba NOVA da planilha (uma por semana),
 * duplicada de uma aba `TEMPLATE` que o usuário formata uma vez só (moeda,
 * %, cores) — o writer só escreve VALORES, nunca formatação, então o layout
 * do template sobrevive intacto (spreadsheets.values.update não mexe em
 * formato de célula).
 *
 * ORDEM DAS COLUNAS (fixa — o cabeçalho da aba TEMPLATE deve seguir esta
 * ordem a partir da linha 2, coluna A):
 *   # · Conta · Criativo · Status · Gasto (R$) · Impressões · CPM (R$) · CTR ·
 *   Cliques · Page Views · Hook Rate · Plays · Play Rate · Ret. Pitch ·
 *   Btn VSL · IC · Compras Meta · VD · Upsell · Downsell · Receita (R$) ·
 *   ROAS · CAC (R$) · Margem Líquida (R$) · Δ Meta×Próprio
 */

export type CreativeReportRow = {
  account_label: string | null;
  ad_id: string;
  ad_name: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  page_views: number;
  initiate_checkout: number;
  meta_purchases: number;
  hook_rate: number | null;
  plays: number | null;
  play_rate: number | null;
  pitch_retention: number | null;
  cta_clicks: number | null;
  sales_vd: number;
  sales_upsell: number;
  sales_downsell: number;
  sales_total: number;
  revenue_total: number;
  roas: number;
  cac: number;
  net_margin: number;
  delta_meta_vs_own: number | null;
};

export type WriteWeeklyReportResult =
  | { ok: true; sheetTabName: string }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "27.07.2026–02.08.2026" — sem "/" (proibido em nome de aba do Sheets). */
function tabNameFor(weekStartYmd: string, weekEndYmd: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}.${m}.${y}`;
  };
  return `${fmt(weekStartYmd)}–${fmt(weekEndYmd)}`;
}

function toRowValues(row: CreativeReportRow, index: number): (string | number)[] {
  const cpm = row.impressions > 0 ? round2((row.spend / row.impressions) * 1000) : "";
  const ctr = row.impressions > 0 ? round2((row.clicks / row.impressions) * 100) : "";

  return [
    index + 1,
    row.account_label ?? "",
    row.ad_name ?? row.ad_id,
    row.status ?? "",
    round2(row.spend),
    row.impressions,
    cpm,
    ctr,
    row.clicks,
    row.page_views,
    row.hook_rate ?? "",
    row.plays ?? "",
    row.play_rate ?? "",
    row.pitch_retention ?? "",
    row.cta_clicks ?? "",
    row.initiate_checkout,
    row.meta_purchases,
    row.sales_vd,
    row.sales_upsell,
    row.sales_downsell,
    round2(row.revenue_total),
    round2(row.roas),
    round2(row.cac),
    round2(row.net_margin),
    row.delta_meta_vs_own ?? "",
  ];
}

function totalsRow(rows: CreativeReportRow[]): (string | number)[] {
  const sum = (f: (r: CreativeReportRow) => number | null) =>
    rows.reduce((acc, r) => acc + (f(r) ?? 0), 0);

  const spend = sum((r) => r.spend);
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.clicks);
  const revenueTotal = sum((r) => r.revenue_total);
  const salesTotal = sum((r) => r.sales_total);

  return [
    "",
    "TOTAL",
    `${rows.length} criativos`,
    "",
    round2(spend),
    impressions,
    impressions > 0 ? round2((spend / impressions) * 1000) : "",
    impressions > 0 ? round2((clicks / impressions) * 100) : "",
    clicks,
    sum((r) => r.page_views),
    "",
    sum((r) => r.plays),
    "",
    "",
    sum((r) => r.cta_clicks),
    sum((r) => r.initiate_checkout),
    sum((r) => r.meta_purchases),
    sum((r) => r.sales_vd),
    sum((r) => r.sales_upsell),
    sum((r) => r.sales_downsell),
    round2(revenueTotal),
    spend > 0 ? round2(revenueTotal / spend) : "",
    salesTotal > 0 ? round2(spend / salesTotal) : "",
    round2(sum((r) => r.net_margin)),
    sum((r) => r.delta_meta_vs_own),
  ];
}

/** Garante a aba da semana: reusa se já existe, senão duplica o TEMPLATE. */
async function ensureWeekTab(
  integration: SheetsIntegration,
  tabName: string,
): Promise<void> {
  const meta = await integration.sheets.spreadsheets.get({
    spreadsheetId: integration.spreadsheetId,
    fields: "sheets.properties",
  });

  const sheetsList = meta.data.sheets ?? [];
  const alreadyExists = sheetsList.some((s) => s.properties?.title === tabName);
  if (alreadyExists) return; // reprocessamento — só sobrescreve os valores.

  const template = sheetsList.find(
    (s) => s.properties?.title === integration.templateTabName,
  );
  const templateSheetId = template?.properties?.sheetId;
  if (templateSheetId === undefined || templateSheetId === null) {
    throw new Error(
      `Aba modelo "${integration.templateTabName}" não encontrada na planilha.`,
    );
  }

  await integration.sheets.spreadsheets.batchUpdate({
    spreadsheetId: integration.spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: templateSheetId,
            newSheetName: tabName,
          },
        },
      ],
    },
  });
}

export async function writeWeeklyReportToSheet(
  areaId: string,
  weekStartYmd: string,
  weekEndYmd: string,
  rows: CreativeReportRow[],
): Promise<WriteWeeklyReportResult> {
  const admin = createAdminClient();
  const tabName = tabNameFor(weekStartYmd, weekEndYmd);

  const integration = await getSheetsIntegration(areaId);
  if (!integration) {
    const error = "Google Sheets não configurado ou credencial inválida.";
    await admin.from("weekly_report_runs").upsert(
      { area_id: areaId, week_start: weekStartYmd, week_end: weekEndYmd, status: "error", error },
      { onConflict: "area_id,week_start" },
    );
    return { ok: false, error };
  }

  try {
    await ensureWeekTab(integration, tabName);

    const sorted = [...rows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    const values = [...sorted.map(toRowValues), totalsRow(sorted)];

    await integration.sheets.spreadsheets.values.update({
      spreadsheetId: integration.spreadsheetId,
      range: `'${tabName}'!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    await admin.from("weekly_report_runs").upsert(
      {
        area_id: areaId,
        week_start: weekStartYmd,
        week_end: weekEndYmd,
        sheet_tab_name: tabName,
        status: "ok",
        error: null,
      },
      { onConflict: "area_id,week_start" },
    );

    return { ok: true, sheetTabName: tabName };
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha desconhecida";
    await admin.from("weekly_report_runs").upsert(
      {
        area_id: areaId,
        week_start: weekStartYmd,
        week_end: weekEndYmd,
        sheet_tab_name: tabName,
        status: "error",
        error: message,
      },
      { onConflict: "area_id,week_start" },
    );
    return { ok: false, error: message };
  }
}
