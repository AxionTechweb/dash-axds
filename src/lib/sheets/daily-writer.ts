import "server-only";

import type { sheets_v4 } from "googleapis";

import type { DailyCampaignSnapshot } from "@/lib/reports/daily";

import { ensureTabFromTemplate, getDailySheetsIntegration } from "./client";

/**
 * Escreve UM checkpoint intradia na aba "dd.mm.yyyy - campanha" (duplicada
 * do TEMPLATE na primeira chamada do dia pra aquela campanha).
 *
 * Diferente do relatório semanal: aqui a aba já tem FÓRMULAS vivas nas
 * colunas "automático" (CPA, ROAS, LUCRO — calculadas a partir das células
 * que este writer preenche) e uma linha PRONTA pra cada horário de
 * checkpoint. Por isso o writer só escreve em duas faixas por linha —
 * `B:H` (FATURAMENTO..CPI) e `L` (VENDAS) — e NUNCA em `I:K` (fórmulas) nem
 * em `M` (AÇÃO/RESULTADO, sempre manual). O nome da campanha vai pra `C13`
 * (célula fixa do rodapé, confirmada contra o template real do usuário) só
 * na criação da aba. `ORÇAMENTO`/`PRODUTO` continuam manuais — sem posição
 * confirmada nem fonte confiável, respectivamente.
 *
 * A coluna IMPOSTO+ADS (K original) foi removida do template (conta em
 * dólar, sem esse imposto) — VENDAS, que era M, passou a ser `L`, e LUCRO
 * (agora em K) não desconta mais imposto: `=Faturamento-Investimento`.
 *
 * Na criação da aba, TAMBÉM limpa `B:H`/`L` das 10 linhas de horário antes
 * de escrever — o TEMPLATE pode ter número de teste/dia anterior parado
 * nas células, e sem isso ele aparecia como se fosse de hoje até aquele
 * horário específico ser escrito de verdade.
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

/** Todas as linhas (1-indexed) de coluna A que parecem hora de checkpoint (0–23). */
async function findCheckpointRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
): Promise<Map<number, number>> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!A1:A40`,
  });

  const byHour = new Map<number, number>();
  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.[0];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n >= 0 && n <= 23) byHour.set(n, i + 1);
  }
  return byHour;
}

/**
 * Limpa os DADOS de todas as linhas de horário logo que a aba do dia é
 * criada — o TEMPLATE pode ter números de um teste/dia anterior parados
 * nas células (visto na prática: valores de exemplo nunca apagados), e sem
 * isso eles apareciam como se fossem de hoje até aquele horário ser escrito
 * de verdade. Limpa só `B:H` e `L` (as mesmas faixas que o writer escreve)
 * — nunca `I:K` (fórmulas) nem `A`/`M`.
 */
async function clearCheckpointRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  checkpointRows: Map<number, number>,
): Promise<void> {
  if (checkpointRows.size === 0) return;

  const rowNumbers = [...checkpointRows.values()];
  const minRow = Math.min(...rowNumbers);
  const maxRow = Math.max(...rowNumbers);

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: [`'${tabName}'!B${minRow}:H${maxRow}`, `'${tabName}'!L${minRow}:L${maxRow}`],
    },
  });
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

    const checkpointRows = await findCheckpointRows(
      integration.sheets,
      integration.spreadsheetId,
      tabName,
    );

    if (created) {
      // Aba nova: limpa qualquer valor que tenha vindo junto do TEMPLATE
      // (teste antigo, dia anterior) antes de escrever o primeiro checkpoint
      // de verdade. Melhor esforço — uma falha aqui não deve impedir a
      // escrita do checkpoint em si.
      try {
        await clearCheckpointRows(
          integration.sheets,
          integration.spreadsheetId,
          tabName,
          checkpointRows,
        );
      } catch (err) {
        console.error("[sheets/daily] falha ao limpar linhas do template:", err);
      }

      // Preenche o nome da campanha no rodapé só na criação da aba — célula
      // fixa (C13), confirmada contra o template real do usuário.
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

    const row = checkpointRows.get(snapshot.horario);
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

    // FATURAMENTO vira fórmula (preço × VENDAS da própria linha) em vez do
    // valor que a Meta reporta via pixel — pedido do usuário: VENDAS já vem
    // confiável do checkout, então multiplicar pelo preço bate melhor que a
    // receita que a Meta atribui sozinha. Preço fixo por enquanto (mesmo
    // valor pra toda campanha) — se algum dia houver campanha com produto de
    // preço diferente, isso precisa vir de algum lugar configurável.
    const UNIT_PRICE = "190,62";
    const faturamentoFormula = `=${UNIT_PRICE}*L${row}`;

    await integration.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: integration.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            // B:H — FATURAMENTO (fórmula), INVEST., CPM, CTR, CPC, CPV, CPI.
            range: `'${tabName}'!B${row}:H${row}`,
            values: [[faturamentoFormula, round2(snapshot.spend), cpm, ctr, cpc, cpv, cpi]],
          },
          {
            // L — VENDAS (antes manual, agora automático via PayT/checkout).
            range: `'${tabName}'!L${row}`,
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
