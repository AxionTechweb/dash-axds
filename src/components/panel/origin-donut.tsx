"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatNumber } from "@/lib/format";
import type { OriginSplit } from "@/lib/metrics";

/**
 * Pago (venda com ad_id, atribuída a um anúncio) vs Orgânico (sem ad_id).
 * Cyan para pago (mesmo tom do "Gasto com Ads"/primary), esmeralda para
 * orgânico — cores saem de variáveis CSS, acompanham tema e branding.
 */
const COLOR_PAID = "hsl(var(--primary))";
const COLOR_ORGANIC = "hsl(var(--accent-emerald))";

export function OriginDonut({ origin }: { origin: OriginSplit }) {
  const total = origin.paid + origin.organic;

  if (total === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Sem vendas aprovadas no período.
        </p>
      </div>
    );
  }

  const data = [
    { name: "Facebook", value: origin.paid, color: COLOR_PAID },
    { name: "Orgânico", value: origin.organic, color: COLOR_ORGANIC },
  ].filter((d) => d.value > 0);

  return (
    <div className="relative flex h-64 w-full flex-col items-center p-3">
      <div className="relative h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
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

      <div className="mt-1 flex items-center gap-4 text-xs">
        {data.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
        ))}
      </div>
    </div>
  );
}
