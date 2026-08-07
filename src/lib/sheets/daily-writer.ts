import "server-only";

import type { sheets_v4 } from "googleapis";

import type { DailyCampaignSnapshot } from "@/lib/reports/daily";

import { ensureTabFromTemplate, getDailySheetsIntegration } from "./client";

/**
 * Escreve UM checkpoint intradia na aba "dd.mm.yyyy - campanha" (duplicada
 * do TEMPLATE na primeira chamada do dia pra aquela campanha).
 *
 * Diferente do relatório semanal: aqui a aba já tem FÓRMULAS vivas nas
 * colunas "automático" (CPA, ROAS, IMPOSTO+ADS, LUCRO — calculadas a partir
 * das células que este writer preenche) e uma linha PRONTA pra cada horário
 * de checkpoint. Por isso o writer só escreve em duas faixas por linha —
 * `B:H` (FATURAMENTO..CPI) e `M` (VENDAS) — e NUNCA em `I:L` (fórmulas) nem
 * em `N` (AÇÃO/RESULTADO, sempre manual). O nome da campanha vai pra `C13`
 * (célula fixa do rodapé, confirmada contra o template real do usuário) só
 * na criação da aba. `ORÇAMENTO`/`PRODUTO` continuam manuais — sem posição
 * confirmada nem fonte confiável, respectivamente.
 */

export type WriteDailyCheckpointResult =
  | { ok: true; sheetTabName: string }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sheets proíbe [ ] * ? / \ : em nome de aba, e limita a 100 caracteres. */
function sanitizeTabName(raw: string): string {
  return raw
    .replace(/[[\]*?/\\:]/g, "")
    .trim()
    .slice(0, 90);
}

/** "06.08.2026 - reteste-winners-12-ca03-2407" */
function tabNameFor(dayYmd: string, campaignName: string): string {
  const [y, m, d] = dayYmd.split("-");
  return `${d}.${m}.${y} - ${sanitizeTabName(campaignName)}`;
}

/**
 * Acha a linha (1-indexed) cuja coluna A bate com o horário do checkpoint.
 * As 10 linhas de horário já vêm prontas do template — nunca insere linha.
 */
async function findCheckpointRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  horario: number,
): Promise<number | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!A1:A40`,
  });

  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.[0];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n === horario) return i + 1;
  }
  return null;
}

export async function writeDailyCheckpointToSheet(
  areaId: string,
  dayYmd: string,
  snapshot: DailyCampaignSnapshot,
): Promise<WriteDailyCheckpointResult> {
  const integration = await getDailySheetsIntegration(areaId);
  if (!integration) {
    return {
      ok: false,
      error: "Google Sheets (checkpoints diários) não configurado ou credencial inválida.",
    };
  }

  const tabName = tabNameFor(dayYmd, snapshot.campaignName);

  try {
    const { created } = await ensureTabFromTemplate(integration, tabName);

    if (created) {
      // Preenche o nome da campanha no rodapé só na criação da aba — célula
      // fixa (C13), confirmada contra o template real do usuário. Melhor
      // esforço: se o layout mudar e a célula não existir mais, não derruba
      // a escrita do checkpoint (que é o que importa).
      try {
        await integration.sheets.spreadsheets.values.update({
          spreadsheetId: integration.spreadsheetId,
          range: `'${tabName}'!C13`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[snapshot.campaignName]] },
        });
      } catch (err) {
        console.error("[sheets/daily] falha ao preencher C13 (campanha):", err);
      }
    }

    const row = await findCheckpointRow(
      integration.sheets,
      integration.spreadsheetId,
      tabName,
      snapshot.horario,
    );
    if (!row) {
      throw new Error(
        `Linha do horário ${snapshot.horario}h não encontrada na aba "${tabName}".`,
      );
    }

    const cpm =
      snapshot.impressions > 0 ? round2((snapshot.spend / snapshot.impressions) * 1000) : "";
    const ctr =
      snapshot.impressions > 0 ? round2((snapshot.clicks / snapshot.impressions) * 100) : "";
    const cpc = snapshot.clicks > 0 ? round2(snapshot.spend / snapshot.clicks) : "";
    const cpv = snapshot.pageViews > 0 ? round2(snapshot.spend / snapshot.pageViews) : "";
    const cpi =
      snapshot.initiateCheckout > 0 ? round2(snapshot.spend / snapshot.initiateCheckout) : "";

    await integration.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: integration.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            // B:H — FATURAMENTO, INVEST., CPM, CTR, CPC, CPV, CPI.
            range: `'${tabName}'!B${row}:H${row}`,
            values: [[round2(snapshot.revenue), round2(snapshot.spend), cpm, ctr, cpc, cpv, cpi]],
          },
          {
            // M — VENDAS (antes manual, agora automático via PayT/checkout).
            range: `'${tabName}'!M${row}`,
            values: [[snapshot.sales]],
          },
        ],
      },
    });

    return { ok: true, sheetTabName: tabName };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha desconhecida",
    };
  }
}
