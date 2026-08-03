import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { ProductRow } from "@/lib/metrics";

/** Vendas por Produto — mesmo padrão visual do RegionBreakdown. */
export function ProductBreakdown({
  products,
  currency,
}: {
  products: ProductRow[];
  currency: string;
}) {
  const totalSales = products.reduce((sum, p) => sum + p.sales, 0);

  if (totalSales === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Sem vendas aprovadas no período.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {products.slice(0, 10).map((row) => {
        const share = (row.sales / totalSales) * 100;

        return (
          <li
            key={row.produto ?? "__sem_produto"}
            className="px-5 py-3.5 transition-colors hover:bg-[hsl(var(--foreground)/0.03)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium tracking-tight">
                {row.produto ?? "Sem produto"}
              </span>
              <span className="micro-label shrink-0">
                {formatNumber(row.sales)} vendas · {formatPercent(share)}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.08)]">
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
