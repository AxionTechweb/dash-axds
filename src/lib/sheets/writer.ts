import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { ensureTabFromTemplate, getSheetsIntegration } from "./client";

/**
 * Escreve o relatório semanal numa aba NOVA da planilha (uma por semana),
 * duplicada de uma aba `TEMPLATE` que o usuário formata uma vez só (moeda,
 * %, cores) — o writer só escreve VALORES, nunca formatação, então o layout
 * do template sobrevive intacto (spreadsheets.values.update não mexe em
 * formato de célula).
 *
 * As colunas são casadas pelo NOME do cabeçalho, não por uma ordem fixa: o
 * template do usuário pode ter linhas de agrupamento acima do cabeçalho real
 * (ex.: "ATENÇÃO" cobrindo "Impressões"/"CPM"/"CTR") — `findHeaderRow`
 * verifica as primeiras linhas e usa a que mais bate com os nomes
 * conhecidos (`HEADER_ALIASES`) como cabeçalho de verdade. Coluna sem nome
 * reconhecido fica em branco — nunca inventa dado.
 */

export type CreativeReportRow = {
  week_start: string;
  week_end: string;
  account_label: string | null;
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  status: string | null;
  spend: number;
  spend_usd: number | null;
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
  vturb_views: number | null;
  vturb_unique_views: number | null;
  vturb_conversions: number | null;
  vturb_revenue: number | null;
  retention_25: number | null;
  retention_50: number | null;
  retention_75: number | null;
  avg_watch_seconds: number | null;
  sales_vd: number;
  revenue_vd: number;
  sales_upsell: number;
  revenue_upsell: number;
  sales_downsell: number;
  revenue_downsell: number;
  sales_total: number;
  revenue_total: number;
  net_revenue: number;
  refund_value: number;
  chargeback_value: number;
  canceled_count: number;
  unique_buyers: number;
  roas: number;
  cpa: number;
  cac: number;
  arpu: number;
  rpv: number;
  conversion_rate: number;
  pv_ic_rate: number;
  checkout_rate: number;
  net_margin: number;
  profit_margin_pct: number;
  delta_meta_vs_own: number | null;
};

export type WriteWeeklyReportResult =
  | { ok: true; sheetTabName: string; unmatchedHeaders: string[] }
  | { ok: false; error: string };

type FieldKey =
  | "index"
  | "week_start"
  | "week_end"
  | "account_label"
  | "ad_id_col"
  | "ad_name"
  | "campaign_name"
  | "status"
  | "spend"
  | "spend_usd"
  | "impressions"
  | "cpm"
  | "ctr"
  | "cpc"
  | "clicks"
  | "page_views"
  | "hook_rate"
  | "retention_25"
  | "retention_50"
  | "retention_75"
  | "avg_watch_seconds"
  | "plays"
  | "play_rate"
  | "pitch_retention"
  | "cta_clicks"
  | "vturb_unique_views"
  | "vturb_conversions"
  | "initiate_checkout"
  | "meta_purchases"
  | "sales_vd"
  | "revenue_vd"
  | "sales_upsell"
  | "revenue_upsell"
  | "sales_downsell"
  | "revenue_downsell"
  | "sales_total"
  | "revenue_total"
  | "net_revenue"
  | "refund_value"
  | "chargeback_value"
  | "canceled_count"
  | "unique_buyers"
  | "roas"
  | "cpa"
  | "cac"
  | "arpu"
  | "rpv"
  | "conversion_rate"
  | "pv_ic_rate"
  | "checkout_rate"
  | "net_margin"
  | "profit_margin_pct"
  | "delta_meta_vs_own";

/**
 * Aliases normalizados (sem acento/espaço/pontuação, minúsculo) por campo.
 * Sempre inclui o texto TOTALMENTE normalizado do cabeçalho da planilha
 * manual ("Consolidado SG Global") como alias exato — a fase de match exato
 * roda ANTES da fase de substring (`matchField`), então isso evita colisão
 * mesmo quando um alias é substring de outro (ex.: "vendas" dentro de
 * "vendasfront").
 */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  index: ["#", "n", "no", "num", "numero"],
  week_start: ["datainicial"],
  week_end: ["datafinal"],
  account_label: ["conta"],
  ad_id_col: ["iddocriativo", "idcriativo", "idanuncio"],
  ad_name: ["criativo", "anuncio", "ad", "nome"],
  campaign_name: ["campanha"],
  status: ["status"],
  spend: ["gasto", "investimento"],
  spend_usd: ["spend"],
  impressions: ["impressoes"],
  cpm: ["cpm"],
  ctr: ["ctr"],
  cpc: ["cpc"],
  clicks: ["cliques"],
  page_views: ["pageviews", "visualizacoesdepagina", "pv"],
  hook_rate: ["hookrate"],
  retention_25: ["ret25"],
  retention_50: ["ret50"],
  retention_75: ["ret75"],
  avg_watch_seconds: ["tempomedio"],
  plays: ["plays", "reproducoes"],
  play_rate: ["playrate"],
  pitch_retention: ["retpitch", "retencaopitch", "pitchretention", "retencaodepitch", "retencao"],
  cta_clicks: ["btnvsl", "cliquescta", "cta", "botaovsl"],
  vturb_unique_views: ["visunicas", "visualizacoesunicas"],
  vturb_conversions: ["conversoesvturb"],
  initiate_checkout: ["ic", "iniciarcheckout", "initiatecheckout"],
  meta_purchases: ["comprasmeta"],
  sales_vd: ["vendasfront", "vd", "vdpayt"],
  revenue_vd: ["receitafront"],
  sales_upsell: ["vendasupsell", "upsell"],
  revenue_upsell: ["receitaupsell"],
  sales_downsell: ["vendasdownsell", "downsell"],
  revenue_downsell: ["receitadownsell"],
  sales_total: ["vendas"],
  revenue_total: ["receitabruta", "receita", "faturamento"],
  net_revenue: ["receitaliquidatotal", "receitaliquida"],
  refund_value: ["reembolso"],
  chargeback_value: ["chargeback"],
  canceled_count: ["canceladas"],
  unique_buyers: ["compradoresunicos"],
  roas: ["roas"],
  cpa: ["cpa"],
  cac: ["cac"],
  arpu: ["arpu"],
  rpv: ["rpv"],
  conversion_rate: ["taxadeconversao"],
  pv_ic_rate: ["convpvic"],
  checkout_rate: ["convcheckout"],
  net_margin: ["margemvsbe", "margemliquida", "margem", "lucro"],
  profit_margin_pct: ["margemdelucro"],
  delta_meta_vs_own: ["deltametaproprio", "deltametapayt", "deltameta", "delta"],
};

const FIELD_ORDER = Object.keys(HEADER_ALIASES) as FieldKey[];

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // acentos (diacríticos combinantes, após NFD)
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // "(r$)", "(%)" etc
    .replace(/[^a-z0-9]/g, ""); // símbolos, espaços, moeda
}

function matchField(headerCell: string): FieldKey | null {
  // "#" é só símbolo — normalizeHeader zera ele, então precisa do caso
  // especial antes de normalizar.
  if (headerCell.trim() === "#") return "index";

  const normalized = normalizeHeader(headerCell);
  if (!normalized) return null;

  for (const field of FIELD_ORDER) {
    if (HEADER_ALIASES[field].includes(normalized)) return field;
  }
  for (const field of FIELD_ORDER) {
    if (HEADER_ALIASES[field].some((alias) => normalized.includes(alias))) return field;
  }
  return null;
}

/**
 * Acha a linha de cabeçalho de verdade entre as primeiras linhas da aba —
 * a que tiver mais células reconhecidas por HEADER_ALIASES. Templates com
 * uma linha de agrupamento acima do cabeçalho (comum nessa planilha) não
 * confundem a detecção.
 */
function findHeaderRow(rows: string[][]): { headerIndex: number; columnMap: (FieldKey | null)[] } | null {
  let best: { headerIndex: number; columnMap: (FieldKey | null)[]; score: number } | null = null;

  for (let i = 0; i < rows.length; i++) {
    const columnMap = (rows[i] ?? []).map((cell) => matchField(cell ?? ""));
    const score = columnMap.filter((f) => f !== null).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { headerIndex: i, columnMap, score };
    }
  }

  return best ? { headerIndex: best.headerIndex, columnMap: best.columnMap } : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "2026-08-17" → "17/08/2026" (data-only, sem depender do fuso do runtime). */
function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** "27.07.2026–02.08.2026" — sem "/" (proibido em nome de aba do Sheets). */
function tabNameFor(weekStartYmd: string, weekEndYmd: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}.${m}.${y}`;
  };
  return `${fmt(weekStartYmd)}–${fmt(weekEndYmd)}`;
}

function fieldValue(
  field: FieldKey | null,
  row: CreativeReportRow,
  index: number,
): string | number {
  if (!field) return "";

  const cpm = row.impressions > 0 ? round2((row.spend / row.impressions) * 1000) : "";
  const ctr = row.impressions > 0 ? round2((row.clicks / row.impressions) * 100) : "";
  const cpc = row.clicks > 0 ? round2(row.spend / row.clicks) : "";

  switch (field) {
    case "index":
      return index + 1;
    case "week_start":
      return formatYmd(row.week_start);
    case "week_end":
      return formatYmd(row.week_end);
    case "account_label":
      return row.account_label ?? "";
    case "ad_id_col":
      return row.ad_id;
    case "ad_name":
      return row.ad_name ?? row.ad_id;
    case "campaign_name":
      return row.campaign_name ?? "";
    case "status":
      return row.status ?? "";
    case "spend":
      return round2(row.spend);
    case "spend_usd":
      return row.spend_usd !== null ? round2(row.spend_usd) : "";
    case "impressions":
      return row.impressions;
    case "cpm":
      return cpm;
    case "ctr":
      return ctr;
    case "cpc":
      return cpc;
    case "clicks":
      return row.clicks;
    case "page_views":
      return row.page_views;
    case "hook_rate":
      return row.hook_rate ?? "";
    case "retention_25":
      return row.retention_25 !== null ? round2(row.retention_25) : "";
    case "retention_50":
      return row.retention_50 !== null ? round2(row.retention_50) : "";
    case "retention_75":
      return row.retention_75 !== null ? round2(row.retention_75) : "";
    case "avg_watch_seconds":
      return row.avg_watch_seconds !== null ? round2(row.avg_watch_seconds) : "";
    case "plays":
      return row.plays ?? "";
    case "play_rate":
      return row.play_rate ?? "";
    case "pitch_retention":
      return row.pitch_retention ?? "";
    case "cta_clicks":
      return row.cta_clicks ?? "";
    case "vturb_unique_views":
      return row.vturb_unique_views ?? "";
    case "vturb_conversions":
      return row.vturb_conversions ?? "";
    case "initiate_checkout":
      return row.initiate_checkout;
    case "meta_purchases":
      return row.meta_purchases;
    case "sales_vd":
      return row.sales_vd;
    case "revenue_vd":
      return round2(row.revenue_vd);
    case "sales_upsell":
      return row.sales_upsell;
    case "revenue_upsell":
      return round2(row.revenue_upsell);
    case "sales_downsell":
      return row.sales_downsell;
    case "revenue_downsell":
      return round2(row.revenue_downsell);
    case "sales_total":
      return row.sales_total;
    case "revenue_total":
      return round2(row.revenue_total);
    case "net_revenue":
      return round2(row.net_revenue);
    case "refund_value":
      return round2(row.refund_value);
    case "chargeback_value":
      return round2(row.chargeback_value);
    case "canceled_count":
      return row.canceled_count;
    case "unique_buyers":
      return row.unique_buyers;
    case "roas":
      return round2(row.roas);
    case "cpa":
      return round2(row.cpa);
    case "cac":
      return round2(row.cac);
    case "arpu":
      return round2(row.arpu);
    case "rpv":
      return round2(row.rpv);
    case "conversion_rate":
      return round2(row.conversion_rate);
    case "pv_ic_rate":
      return round2(row.pv_ic_rate);
    case "checkout_rate":
      return round2(row.checkout_rate);
    case "net_margin":
      return round2(row.net_margin);
    case "profit_margin_pct":
      return round2(row.profit_margin_pct);
    case "delta_meta_vs_own":
      return row.delta_meta_vs_own ?? "";
  }
}

function totalsValue(
  field: FieldKey | null,
  rows: CreativeReportRow[],
): string | number {
  if (!field) return "";

  const sum = (f: (r: CreativeReportRow) => number | null) =>
    rows.reduce((acc, r) => acc + (f(r) ?? 0), 0);

  const spend = sum((r) => r.spend);
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.clicks);
  const revenueTotal = sum((r) => r.revenue_total);
  const salesTotal = sum((r) => r.sales_total);
  const initiateCheckout = sum((r) => r.initiate_checkout);
  const pageViews = sum((r) => r.page_views);
  const uniqueBuyers = sum((r) => r.unique_buyers);
  const vturbUniqueViews = sum((r) => r.vturb_unique_views);
  const netMargin = sum((r) => r.net_margin);

  switch (field) {
    case "index":
      return "";
    case "week_start":
    case "week_end":
    case "ad_id_col":
    case "campaign_name":
      return "";
    case "account_label":
      return "TOTAL";
    case "ad_name":
      return `${rows.length} criativos`;
    case "status":
      return "";
    case "spend":
      return round2(spend);
    case "spend_usd":
      return round2(sum((r) => r.spend_usd));
    case "impressions":
      return impressions;
    case "cpm":
      return impressions > 0 ? round2((spend / impressions) * 1000) : "";
    case "ctr":
      return impressions > 0 ? round2((clicks / impressions) * 100) : "";
    case "cpc":
      return clicks > 0 ? round2(spend / clicks) : "";
    case "clicks":
      return clicks;
    case "page_views":
      return pageViews;
    case "hook_rate":
    case "play_rate":
    case "pitch_retention":
    case "retention_25":
    case "retention_50":
    case "retention_75":
    case "avg_watch_seconds":
      return ""; // médias ponderadas não têm uma soma que faça sentido aqui
    case "plays":
      return sum((r) => r.plays);
    case "cta_clicks":
      return sum((r) => r.cta_clicks);
    case "vturb_unique_views":
      return vturbUniqueViews;
    case "vturb_conversions":
      return sum((r) => r.vturb_conversions);
    case "initiate_checkout":
      return initiateCheckout;
    case "meta_purchases":
      return sum((r) => r.meta_purchases);
    case "sales_vd":
      return sum((r) => r.sales_vd);
    case "revenue_vd":
      return round2(sum((r) => r.revenue_vd));
    case "sales_upsell":
      return sum((r) => r.sales_upsell);
    case "revenue_upsell":
      return round2(sum((r) => r.revenue_upsell));
    case "sales_downsell":
      return sum((r) => r.sales_downsell);
    case "revenue_downsell":
      return round2(sum((r) => r.revenue_downsell));
    case "sales_total":
      return salesTotal;
    case "revenue_total":
      return round2(revenueTotal);
    case "net_revenue":
      return round2(sum((r) => r.net_revenue));
    case "refund_value":
      return round2(sum((r) => r.refund_value));
    case "chargeback_value":
      return round2(sum((r) => r.chargeback_value));
    case "canceled_count":
      return sum((r) => r.canceled_count);
    case "unique_buyers":
      return uniqueBuyers;
    case "roas":
      return spend > 0 ? round2(revenueTotal / spend) : "";
    case "cpa":
      return salesTotal > 0 ? round2(spend / salesTotal) : "";
    case "cac":
      return uniqueBuyers > 0 ? round2(spend / uniqueBuyers) : "";
    case "arpu":
      return uniqueBuyers > 0 ? round2(revenueTotal / uniqueBuyers) : "";
    case "rpv":
      return vturbUniqueViews > 0 ? round2(revenueTotal / vturbUniqueViews) : "";
    case "conversion_rate":
      return clicks > 0 ? round2((salesTotal / clicks) * 100) : "";
    case "pv_ic_rate":
      return pageViews > 0 ? round2((initiateCheckout / pageViews) * 100) : "";
    case "checkout_rate":
      return initiateCheckout > 0 ? round2((salesTotal / initiateCheckout) * 100) : "";
    case "net_margin":
      return round2(netMargin);
    case "profit_margin_pct":
      return revenueTotal > 0 ? round2((netMargin / revenueTotal) * 100) : "";
    case "delta_meta_vs_own":
      return sum((r) => r.delta_meta_vs_own);
  }
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
    await ensureTabFromTemplate(integration, tabName);

    // Lê as primeiras linhas da aba TEMPLATE (não da aba nova — o conteúdo é
    // o mesmo, mas o template não muda de semana pra semana) pra achar o
    // cabeçalho real e casar cada coluna pelo nome.
    const headerProbe = await integration.sheets.spreadsheets.values.get({
      spreadsheetId: integration.spreadsheetId,
      // ZZ cobre até 702 colunas — margem de sobra pro template crescer sem
      // que colunas novas fiquem invisíveis pro casamento por nome (já
      // aconteceu: com 58 colunas no template, "A1:Z6" (26) descartava tudo
      // depois de "Data Inicial" silenciosamente).
      range: `'${integration.templateTabName}'!A1:ZZ6`,
    });
    const probeRows = (headerProbe.data.values ?? []) as string[][];
    const header = findHeaderRow(probeRows);
    if (!header) {
      throw new Error(
        `Não encontrei um cabeçalho reconhecível nas primeiras linhas da aba "${integration.templateTabName}".`,
      );
    }

    const unmatchedHeaders = probeRows[header.headerIndex]
      .filter((_, i) => header.columnMap[i] === null && probeRows[header.headerIndex][i]?.trim())
      .map((cell) => cell.trim());

    const sorted = [...rows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    const dataRows = sorted.map((row, index) =>
      header.columnMap.map((field) => fieldValue(field, row, index)),
    );
    const totals = header.columnMap.map((field) => totalsValue(field, sorted));

    // Os dados começam logo abaixo do cabeçalho detectado (1-indexed + 1).
    const startRow = header.headerIndex + 2;

    await integration.sheets.spreadsheets.values.update({
      spreadsheetId: integration.spreadsheetId,
      range: `'${tabName}'!A${startRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [...dataRows, totals] },
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

    return { ok: true, sheetTabName: tabName, unmatchedHeaders };
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
