import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stat card no padrão da referência Finex: caixa de ícone tintada à esquerda,
 * rótulo micro em mono caixa-alta à direita, e o valor em corpo grande e LEVE
 * (font-light) com numerais tabulares. A borda acende na cor do acento no hover.
 *
 * Valores monetários levam a classe `sensitive` para serem borrados pelo botão
 * "ocultar valores".
 */

type Accent = "default" | "primary" | "destructive" | "purple" | "emerald";

/** Cada acento controla a cor do ícone, do fundo do tile e da borda no hover. */
const ACCENTS: Record<Accent, { tile: string; value: string; border: string }> =
  {
    default: {
      tile: "bg-[hsl(var(--muted-foreground)/0.1)] text-muted-foreground",
      value: "text-foreground",
      border: "hover:border-[hsl(var(--foreground)/0.2)]",
    },
    primary: {
      tile: "bg-[hsl(var(--primary)/0.1)] text-primary",
      value: "text-foreground",
      border: "hover:border-[hsl(var(--primary)/0.3)]",
    },
    destructive: {
      tile: "bg-[hsl(var(--destructive)/0.1)] text-destructive",
      value: "text-destructive",
      border: "hover:border-[hsl(var(--destructive)/0.3)]",
    },
    purple: {
      tile: "bg-[hsl(var(--accent-purple)/0.1)] text-purple",
      value: "text-foreground",
      border: "hover:border-[hsl(var(--accent-purple)/0.3)]",
    },
    emerald: {
      tile: "bg-[hsl(var(--accent-emerald)/0.1)] text-emerald",
      value: "text-foreground",
      border: "hover:border-[hsl(var(--accent-emerald)/0.3)]",
    },
  };

/**
 * Sparkline puramente decorativa-informativa: recebe a série já normalizada e
 * desenha em SVG, sem biblioteca. `preserveAspectRatio="none"` deixa esticar
 * na largura do card.
 */
function Sparkline({ series, className }: { series: number[]; className?: string }) {
  if (series.length < 2) return null;

  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const step = 100 / (series.length - 1);

  const points = series
    .map((v, i) => `${(i * step).toFixed(2)} ${(22 - ((v - min) / span) * 20).toFixed(2)}`)
    .join(" L ");

  return (
    <div className={cn("mt-4 h-8 w-full opacity-60 transition-opacity", className)}>
      <svg
        className="h-full w-full"
        viewBox="0 0 100 24"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={`M ${points}`}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M ${points} L 100 24 L 0 24 Z`}
          fill="currentColor"
          fillOpacity="0.15"
        />
      </svg>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
  unit,
  series,
  accent = "default",
  sensitive = true,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  sub?: string;
  /** Sufixo discreto ao lado do valor (ex.: "BRL", "%"). */
  unit?: string;
  /** Série opcional para a sparkline do rodapé. */
  series?: number[];
  accent?: Accent;
  sensitive?: boolean;
}) {
  const tone = ACCENTS[accent];

  return (
    <div
      className={cn(
        "glass group/stat relative overflow-hidden p-5",
        "hover:bg-[hsl(var(--foreground)/0.02)]",
        tone.border,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={cn("icon-tile", tone.tile)}>
          <Icon className="size-4" />
        </span>
        <span className="micro-label pt-1 text-right">{label}</span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "stat-value text-3xl",
            tone.value,
            sensitive && "sensitive",
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </div>

      {sub ? (
        <p
          className={cn(
            "mt-1.5 text-xs text-muted-foreground",
            sensitive && "sensitive",
          )}
        >
          {sub}
        </p>
      ) : null}

      {series?.length ? (
        <Sparkline
          series={series}
          className={cn(
            "text-primary group-hover/stat:opacity-100",
            accent === "destructive" && "text-destructive",
            accent === "purple" && "text-purple",
            accent === "emerald" && "text-emerald",
          )}
        />
      ) : null}
    </div>
  );
}
