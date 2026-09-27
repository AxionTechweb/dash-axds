"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatNumber } from "@/lib/format";
import type { PaymentMethodRow } from "@/lib/metrics";

/**
 * Ordem categórica FIXA por método conhecido — nunca cor por rank/posição,
 * senão o mesmo método trocaria de cor conforme o que mais vende no período.
 * Método não reconhecido (plataforma nova, valor cru) cai no cinza neutro.
 */
const METHOD_COLORS: Record<string, string> = {
  Cartão: "hsl(var(--primary))",
  PIX: "hsl(var(--accent-emerald))",
  Boleto: "hsl(var(--accent-amber))",
  PayPal: "hsl(var(--accent-azure))",
};
const FALLBACK_COLOR = "hsl(var(--muted-foreground))";

function colorFor(method: string): string {
  return METHOD_COLORS[method] ?? FALLBACK_COLOR;
}

export function PaymentMethodDonut({ methods }: { methods: PaymentMethodRow[] }) {
  const total = methods.reduce((sum, m) => sum + m.count, 0);

  if (total === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Sem dado de método de pagamento no período — nem toda plataforma de
          checkout envia esse campo no webhook.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-64 w-full flex-col items-center p-3">
      <div className="relative h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={methods}
              dataKey="count"
              nameKey="method"
              innerRadius="68%"
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {methods.map((entry) => (
                <Cell key={entry.method} fill={colorFor(entry.method)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "0.78rem",
                boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value, name) => [formatNumber(Number(value) || 0), String(name ?? "")]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="stat-value text-2xl">{formatNumber(total)}</span>
          <span className="micro-label text-muted-foreground">Vendas</span>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-4 text-xs">
        {methods.map((entry) => (
          <span key={entry.method} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: colorFor(entry.method) }}
            />
            {entry.method}
          </span>
        ))}
      </div>
    </div>
  );
}
