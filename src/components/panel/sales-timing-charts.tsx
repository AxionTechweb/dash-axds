"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HourPoint, WeekdayPoint } from "@/lib/metrics";

/**
 * Vendas por dia da semana e por horário — mesmo par de acentos da
 * referência (âmbar para dia da semana, esmeralda para horário). Cores saem
 * de variáveis CSS para acompanhar tema e branding, como o RevenueChart.
 */
const COLOR_WEEKDAY = "hsl(var(--accent-amber))";
const COLOR_HOUR = "hsl(var(--accent-emerald))";

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "currentColor" },
  className: "text-muted-foreground",
};

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    fontSize: "0.78rem",
    boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
  itemStyle: { color: "hsl(var(--foreground))" },
};

export function WeekdaySalesChart({ data }: { data: WeekdayPoint[] }) {
  return (
    <div className="h-56 w-full p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-muted-foreground/15"
            vertical={false}
          />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis width={32} allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
            {...tooltipStyle}
            formatter={(value) => [`${value}`, "Vendas"]}
          />
          <Bar dataKey="count" name="Vendas" fill={COLOR_WEEKDAY} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function hourLabel(hour: number): string {
  return `${hour}h`;
}

export function HourSalesChart({ data }: { data: HourPoint[] }) {
  return (
    <div className="h-56 w-full p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-muted-foreground/15"
            vertical={false}
          />
          <XAxis
            dataKey="hour"
            tickFormatter={hourLabel}
            interval={1}
            {...axisProps}
          />
          <YAxis width={32} allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
            {...tooltipStyle}
            labelFormatter={(label) => hourLabel(Number(label))}
            formatter={(value) => [`${value}`, "Vendas"]}
          />
          <Bar dataKey="count" name="Vendas" fill={COLOR_HOUR} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
