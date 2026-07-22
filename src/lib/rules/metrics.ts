/**
 * Métricas disponíveis nas Regras. Fica fora do engine (que é server-only)
 * para poder ser usado também no formulário do cliente.
 */
export const RULE_METRICS = [
  { key: "spend", label: "Gasto" },
  { key: "revenue", label: "Faturamento" },
  { key: "profit", label: "Lucro" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "sales", label: "Vendas" },
  { key: "checkouts", label: "Checkouts" },
  { key: "ctr", label: "CTR (%)" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "impressions", label: "Impressões" },
] as const;

export type RuleMetric = (typeof RULE_METRICS)[number]["key"];
