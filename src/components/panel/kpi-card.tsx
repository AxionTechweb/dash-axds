import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card de KPI: label em caps pequenas + ícone discreto + valor grande em fonte
 * mono tabular. Valores monetários levam a classe `sensitive` para serem
 * borrados pelo botão "ocultar valores".
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
  accent = "default",
  sensitive = true,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  sub?: string;
  accent?: "default" | "primary" | "destructive";
  sensitive?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 shrink-0 text-muted-foreground/70" />
      </div>

      <p
        className={cn(
          "mt-3 font-mono text-2xl font-semibold tracking-tight tabular",
          accent === "primary" && "text-primary",
          accent === "destructive" && "text-destructive",
          sensitive && "sensitive",
        )}
      >
        {value}
      </p>

      {sub ? (
        <p
          className={cn(
            "mt-1 text-xs text-muted-foreground",
            sensitive && "sensitive",
          )}
        >
          {sub}
        </p>
      ) : null}
    </Card>
  );
}
