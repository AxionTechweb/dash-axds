import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { RegionRow } from "@/lib/metrics";

/**
 * Vendas por Região — recorte a partir do GEO derivado dos headers da Vercel.
 * O mapa (choropleth) entra na página Geo, na Fase 7.
 */
export function RegionBreakdown({
  regions,
  currency,
}: {
  regions: RegionRow[];
  currency: string;
}) {
  const totalSales = regions.reduce((sum, r) => sum + r.sales, 0);

  if (totalSales === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Sem vendas com dados de região no período. O GEO é derivado dos
          headers da Vercel quando o visitante é capturado.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {regions.slice(0, 10).map((row) => {
        const share = (row.sales / totalSales) * 100;
        const label = [row.region, row.country].filter(Boolean).join(" · ");

        return (
          <li key={`${row.country}-${row.region}`} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium">
                {label || "Desconhecida"}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                {formatNumber(row.sales)} vendas · {formatPercent(share)}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="fill-neon h-full rounded-full"
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="sensitive shrink-0 font-mono text-xs tabular">
                {formatCurrency(row.revenue, currency)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
