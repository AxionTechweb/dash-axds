"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { VturbRetentionPoint } from "@/lib/vturb/stats";

/**
 * Curva de retenção do vídeo — série única, mesmo "design system" de
 * RevenueChart (cores via CSS var, gradiente, tooltip com crosshair). Sem
 * legenda: série única, o título do card já identifica o que é.
 */
const COLOR_RETENTION = "hsl(var(--primary))";

function formatSeconds(value: number): string {
  const total = Math.round(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VturbRetentionChart({ data }: { data: VturbRetentionPoint[] }) {
  return (
    <div className="h-72 w-full p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fillRetention" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_RETENTION} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOR_RETENTION} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-muted-foreground/15"
            vertical={false}
          />
          <XAxis
            dataKey="seconds"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatSeconds}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--foreground) / 0.15)" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              fontSize: "0.78rem",
              boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelFormatter={(label) => formatSeconds(Number(label) || 0)}
            formatter={(value) => [`${(Number(value) || 0).toFixed(1)}%`, "Retenção"]}
          />

          <Area
            type="monotone"
            dataKey="retentionPercent"
            name="Retenção"
            stroke={COLOR_RETENTION}
            strokeWidth={2}
            fill="url(#fillRetention)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
