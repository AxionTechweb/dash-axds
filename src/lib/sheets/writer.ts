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
  | { ok: true; sheetTabName: string; unmatchedHeaders: string[] }
  | { ok: false; error: string };

type FieldKey =
  | "index"
  | "account_label"
  | "ad_name"
  | "status"
  | "spend"
  | "impressions"
  | "cpm"
  | "ctr"
  | "cpc"
  | "clicks"
  | "page_views"
  | "hook_rate"
  | "plays"
  | "play_rate"
  | "pitch_retention"
  | "cta_clicks"
  | "initiate_checkout"
  | "meta_purchases"
  | "sales_vd"
  | "sales_upsell"
  | "sales_downsell"
  | "revenue_total"
  | "roas"
  | "cac"
  | "net_margin"
  | "delta_meta_vs_own";

/** Aliases normalizados (sem acento/espaço/pontuação, minúsculo) por campo. */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  index: ["#", "n", "no", "num", "numero"],
  account_label: ["conta"],
  ad_name: ["criativo", "anuncio", "ad", "nome"],
  status: ["status"],
  spend: ["gasto", "investimento"],
  impressions: ["impressoes"],
  cpm: ["cpm"],
  ctr: ["ctr"],
  cpc: ["cpc"],
  clicks: ["cliques"],
  page_views: ["pageviews", "visualizacoesdepagina", "pv"],
  hook_rate: ["hookrate"],
  plays: ["plays", "reproducoes"],
  play_rate: ["playrate"],
  pitch_retention: ["retpitch", "retencaopitch", "pitchretention", "retencao"],
  cta_clicks: ["btnvsl", "cliquescta", "cta", "botaovsl"],
  initiate_checkout: ["ic", "iniciarcheckout", "initiatecheckout"],
  meta_purchases: ["comprasmeta"],
  sales_vd: ["vd", "vdpayt"],
  sales_upsell: ["upsell"],
  sales_downsell: ["downsell"],
  revenue_total: ["receita", "faturamento"],
  roas: ["roas"],
  cac: ["cac"],
  net_margin: ["margemvsbe", "margemliquida", "margem", "lucro"],
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
    case "account_label":
      return row.account_label ?? "";
    case "ad_name":
      return row.ad_name ?? row.ad_id;
    case "status":
      return row.status ?? "";
    case "spend":
      return round2(row.spend);
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
    case "plays":
      return row.plays ?? "";
    case "play_rate":
      return row.play_rate ?? "";
    case "pitch_retention":
      return row.pitch_retention ?? "";
    case "cta_clicks":
      return row.cta_clicks ?? "";
    case "initiate_checkout":
      return row.initiate_checkout;
    case "meta_purchases":
      return row.meta_purchases;
    case "sales_vd":
      return row.sales_vd;
    case "sales_upsell":
      return row.sales_upsell;
    case "sales_downsell":
      return row.sales_downsell;
    case "revenue_total":
      return round2(row.revenue_total);
    case "roas":
      return round2(row.roas);
    case "cac":
      return round2(row.cac);
    case "net_margin":
      return round2(row.net_margin);
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

  switch (field) {
    case "index":
      return "";
    case "account_label":
      return "TOTAL";
    case "ad_name":
      return `${rows.length} criativos`;
    case "status":
      return "";
    case "spend":
      return round2(spend);
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
      return sum((r) => r.page_views);
    case "hook_rate":
    case "play_rate":
    case "pitch_retention":
      return ""; // médias ponderadas não têm uma soma que faça sentido aqui
    case "plays":
      return sum((r) => r.plays);
    case "cta_clicks":
      return sum((r) => r.cta_clicks);
    case "initiate_checkout":
      return sum((r) => r.initiate_checkout);
    case "meta_purchases":
      return sum((r) => r.meta_purchases);
    case "sales_vd":
      return sum((r) => r.sales_vd);
    case "sales_upsell":
      return sum((r) => r.sales_upsell);
    case "sales_downsell":
      return sum((r) => r.sales_downsell);
    case "revenue_total":
      return round2(revenueTotal);
    case "roas":
      return spend > 0 ? round2(revenueTotal / spend) : "";
    case "cac":
      return salesTotal > 0 ? round2(spend / salesTotal) : "";
    case "net_margin":
      return round2(sum((r) => r.net_margin));
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
      range: `'${integration.templateTabName}'!A1:Z6`,
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
