import "server-only";

import { getWeeklySalesByAdAndTier } from "@/lib/attribution";
import { getMetaEntities } from "@/lib/meta/campaigns";
import { getCheckpointDayRange } from "@/lib/period";
import { writeDailyCheckpointToSheet } from "@/lib/sheets/daily-writer";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acompanhamento diário por campanha ATIVA — checkpoints intradia (Meta +
 * vendas do checkout) escritos numa aba "dd.mm.yyyy - campanha" por área,
 * na 2ª planilha (independente do relatório semanal).
 *
 * Chamado a cada hora por um agendador EXTERNO (não a Vercel Cron nativa —
 * plano Hobby só roda 1x/dia). Só faz algo quando a hora atual (BRT) bate
 * com um dos CHECKPOINT_HOURS; fora disso é um no-op barato — é isso que
 * permite o agendador externo ficar simples (1 job de hora em hora) sem
 * precisar saber quais horários importam.
 */

export const CHECKPOINT_HOURS = [6, 9, 11, 12, 14, 16, 17, 19, 22, 0] as const;

export type DailyCampaignSnapshot = {
  campaignId: string;
  campaignName: string;
  accountLabel: string;
  horario: number;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  pageViews: number;
  initiateCheckout: number;
  sales: number;
  budgetAmount: number | null;
};

export type DailyAreaSummary = {
  areaId: string;
  campaigns: number;
  sheetOk: number;
  errors: string[];
};

export type DailyRunResult =
  | { skipped: true; hour: number }
  | { skipped: false; day: string; hour: number; areas: DailyAreaSummary[] };

async function buildAreaSnapshots(
  areaId: string,
  dayStart: Date,
  now: Date,
  horario: number,
): Promise<{ snapshots: DailyCampaignSnapshot[]; errors: string[] }> {
  const [meta, sales] = await Promise.all([
    getMetaEntities(areaId, "campaign", dayStart, now),
    // Genérica por intervalo de datas, apesar do nome — mesma função do
    // relatório semanal (admin client: funciona sem sessão de usuário,
    // crítico pra rodar a partir do cron). Só uso `.sales` aqui.
    getWeeklySalesByAdAndTier(areaId, dayStart, now),
  ]);

  // Só campanhas rodando AGORA — diferente do relatório semanal (histórico),
  // aqui é literalmente "o que está ativo neste instante".
  const activeCampaigns = meta.rows.filter(
    (c) => c.effectiveStatus.toUpperCase() === "ACTIVE",
  );

  const snapshots = activeCampaigns.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    accountLabel: c.accountLabel,
    horario,
    spend: c.spend,
    revenue: c.metaRevenue,
    impressions: c.impressions,
    clicks: c.clicks,
    pageViews: c.metaLandingPageView,
    initiateCheckout: c.metaInitiateCheckout,
    sales: c.adIds.reduce((acc, adId) => acc + (sales.get(adId)?.sales ?? 0), 0),
    budgetAmount: c.budgetAmount,
  }));

  return { snapshots, errors: meta.errors };
}

export async function runDailyCheckpointForAllAreas(
  reference: Date = new Date(),
): Promise<DailyRunResult> {
  const { dayStart, dayYmd, hour } = getCheckpointDayRange(reference);

  if (!(CHECKPOINT_HOURS as readonly number[]).includes(hour)) {
    return { skipped: true, hour };
  }

  const admin = createAdminClient();
  const { data: areas } = await admin.from("areas").select("id");
  if (!areas?.length) return { skipped: false, day: dayYmd, hour, areas: [] };

  const areaSummaries: DailyAreaSummary[] = [];

  for (const area of areas) {
    const areaId = area.id as string;

    try {
      const { snapshots, errors } = await buildAreaSnapshots(
        areaId,
        dayStart,
        reference,
        hour,
      );

      let sheetOk = 0;
      const runErrors = [...errors];

      for (const snapshot of snapshots) {
        const sheetResult = await writeDailyCheckpointToSheet(areaId, dayYmd, snapshot);

        await admin.from("daily_campaign_checkpoints").upsert(
          {
            area_id: areaId,
            day: dayYmd,
            campaign_id: snapshot.campaignId,
            campaign_name: snapshot.campaignName,
            horario: snapshot.horario,
            sheet_tab_name: sheetResult.ok ? sheetResult.sheetTabName : null,
            spend: snapshot.spend,
            revenue: snapshot.revenue,
            impressions: snapshot.impressions,
            clicks: snapshot.clicks,
            page_views: snapshot.pageViews,
            initiate_checkout: snapshot.initiateCheckout,
            sales: snapshot.sales,
            status: sheetResult.ok ? "ok" : "error",
            error: sheetResult.ok ? null : sheetResult.error,
          },
          { onConflict: "area_id,day,campaign_id,horario" },
        );

        if (sheetResult.ok) sheetOk += 1;
        else runErrors.push(`${snapshot.campaignName}: ${sheetResult.error}`);
      }

      areaSummaries.push({
        areaId,
        campaigns: snapshots.length,
        sheetOk,
        errors: runErrors,
      });
    } catch (err) {
      areaSummaries.push({
        areaId,
        campaigns: 0,
        sheetOk: 0,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return { skipped: false, day: dayYmd, hour, areas: areaSummaries };
}
