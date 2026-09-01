/**
 * Classificação de venda por VALOR — regra combinada com o usuário:
 * R$97,00 é downsell, R$297,00 é upsell. Independe do nome do produto
 * (diferente de `product_tiers`, que classifica por produto e alimenta o
 * relatório semanal) — usada na aba Vendas e nos KPIs do Dashboard.
 *
 * Sem "server-only": função pura, usada tanto no servidor (metrics.ts)
 * quanto em componente cliente (tabela de vendas).
 */

export type SaleValueTier = "front" | "downsell" | "upsell" | "outro";

const FRONT_VALUE = 197;
const DOWNSELL_VALUE = 97;
const UPSELL_VALUE = 297;
const EPSILON = 0.01;

export function classifySaleByValue(valor: number | null | undefined): SaleValueTier {
  if (valor === null || valor === undefined) return "outro";
  if (Math.abs(valor - FRONT_VALUE) < EPSILON) return "front";
  if (Math.abs(valor - DOWNSELL_VALUE) < EPSILON) return "downsell";
  if (Math.abs(valor - UPSELL_VALUE) < EPSILON) return "upsell";
  return "outro";
}

export const SALE_TIER_LABEL: Record<SaleValueTier, string> = {
  front: "Front",
  downsell: "Downsell",
  upsell: "Upsell",
  outro: "—",
};
