import "server-only";

import { getLastClickByAd } from "@/lib/attribution";
import { getMetaEntities, type MetaLevel } from "@/lib/meta/campaigns";
import { updateEntityStatus } from "@/lib/meta/write";
import { resolvePeriod } from "@/lib/period";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Motor das Regras de automação.
 *
 * Conservador de propósito: só PAUSAR ou NOTIFICAR. Nunca aumenta orçamento,
 * nunca ativa nada sozinho. Usa os MESMOS dados já cacheados de Campanhas,
 * sem requisições extras à Meta além do cache normal.
 */

export type Rule = {
  id: string;
  area_id: string;
  nome: string;
  nivel: "campanha" | "conjunto" | "anuncio";
  metric: string;
  operator: ">" | "<";
  value: number;
  period: string;
  action: "pausar" | "notificar";
  ativa: boolean;
};

const LEVEL_MAP: Record<Rule["nivel"], MetaLevel> = {
  campanha: "campaign",
  conjunto: "adset",
  anuncio: "ad",
};

export type RuleRunSummary = {
  ruleId: string;
  ruleName: string;
  evaluated: number;
  matched: number;
  actedOn: number;
  errors: string[];
};

/** Avalia uma regra e aplica a ação nas entidades que baterem a condição. */
export async function runRule(
  rule: Rule,
  taxRate: number,
): Promise<RuleRunSummary> {
  const summary: RuleRunSummary = {
    ruleId: rule.id,
    ruleName: rule.nome,
    evaluated: 0,
    matched: 0,
    actedOn: 0,
    errors: [],
  };

  const period = resolvePeriod({ period: rule.period });
  const level = LEVEL_MAP[rule.nivel];

  const [meta, lastClick] = await Promise.all([
    getMetaEntities(rule.area_id, level, period.from, period.to),
    getLastClickByAd(rule.area_id, period.from, period.to),
  ]);

  summary.errors.push(...meta.errors);
  summary.evaluated = meta.rows.length;

  const admin = createAdminClient();

  for (const entity of meta.rows) {
    const own = entity.adIds.reduce(
      (acc, adId) => {
        const row = lastClick.get(adId);
        if (row) {
          acc.sales += row.sales;
          acc.revenue += row.revenue;
          acc.checkouts += row.checkouts;
        }
        return acc;
      },
      { sales: 0, revenue: 0, checkouts: 0 },
    );

    const tax = own.revenue * (taxRate / 100);

    const metrics: Record<string, number> = {
      spend: entity.spend,
      revenue: own.revenue,
      profit: own.revenue - entity.spend - tax,
      roas: entity.spend > 0 ? own.revenue / entity.spend : 0,
      cpa: own.sales > 0 ? entity.spend / own.sales : 0,
      sales: own.sales,
      checkouts: own.checkouts,
      ctr:
        entity.impressions > 0
          ? (entity.clicks / entity.impressions) * 100
          : 0,
      cpc: entity.clicks > 0 ? entity.spend / entity.clicks : 0,
      cpm:
        entity.impressions > 0
          ? (entity.spend / entity.impressions) * 1000
          : 0,
      impressions: entity.impressions,
    };

    const actual = metrics[rule.metric];
    if (actual === undefined) {
      summary.errors.push(`Métrica desconhecida: ${rule.metric}`);
      break;
    }

    const matched =
      rule.operator === ">" ? actual > rule.value : actual < rule.value;

    if (!matched) continue;
    summary.matched += 1;

    let actionTaken = "notificado";
    let ok = true;
    let errorMessage: string | null = null;

    // Só pausa o que ainda está ativo.
    if (rule.action === "pausar" && entity.status.toUpperCase() === "ACTIVE") {
      const result = await updateEntityStatus(
        rule.area_id,
        entity.accountId,
        entity.id,
        "PAUSED",
      );
      ok = result.ok;
      errorMessage = result.error ?? null;
      actionTaken = result.ok ? "pausado" : "falha ao pausar";
      if (result.ok) summary.actedOn += 1;
      else summary.errors.push(`${entity.name}: ${result.error}`);
    }

    await admin.from("rule_executions").insert({
      area_id: rule.area_id,
      rule_id: rule.id,
      matched: true,
      action_taken: actionTaken,
      target_level: rule.nivel,
      target_id: entity.id,
      details: {
        entity_name: entity.name,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.value,
        actual,
        ok,
        error: errorMessage,
      },
    });

    await admin.from("audit_log").insert({
      area_id: rule.area_id,
      actor_email: null, // execução automática (cron)
      action: "rule.execute",
      target_type: "meta_entity",
      target_id: entity.id,
      details: {
        rule: rule.nome,
        action: actionTaken,
        metric: rule.metric,
        actual,
      },
    });
  }

  // Se nada bateu, registra a passagem para o histórico não ficar mudo.
  if (summary.matched === 0) {
    await admin.from("rule_executions").insert({
      area_id: rule.area_id,
      rule_id: rule.id,
      matched: false,
      action_taken: null,
      details: { evaluated: summary.evaluated },
    });
  }

  await admin
    .from("automation_rules")
    .update({ last_run: new Date().toISOString() })
    .eq("id", rule.id);

  return summary;
}

/** Executa todas as regras ativas de todas as áreas (chamado pelo cron). */
export async function runAllRules(): Promise<RuleRunSummary[]> {
  const admin = createAdminClient();

  const { data: rules } = await admin
    .from("automation_rules")
    .select("id, area_id, nome, nivel, metric, operator, value, period, action, ativa")
    .eq("ativa", true);

  if (!rules?.length) return [];

  // Alíquota por área (entra no cálculo de lucro).
  const { data: settings } = await admin
    .from("settings")
    .select("area_id, tax_rate");

  const taxByArea = new Map(
    (settings ?? []).map((s) => [s.area_id as string, Number(s.tax_rate) || 0]),
  );

  const summaries: RuleRunSummary[] = [];
  for (const rule of rules as Rule[]) {
    try {
      summaries.push(await runRule(rule, taxByArea.get(rule.area_id) ?? 0));
    } catch (err) {
      summaries.push({
        ruleId: rule.id,
        ruleName: rule.nome,
        evaluated: 0,
        matched: 0,
        actedOn: 0,
        errors: [err instanceof Error ? err.message : "erro desconhecido"],
      });
    }
  }

  return summaries;
}
