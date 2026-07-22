import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Placeholder de rota ainda não implementada. O shell (Fase 2) já entrega a
 * navegação completa; cada página é preenchida na sua fase.
 */
export function PagePlaceholder({
  title,
  description,
  phase,
  icon: Icon,
  items,
}: {
  title: string;
  description: string;
  phase: string;
  icon: LucideIcon;
  items?: string[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-primary">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 space-y-2">
          <p className="text-sm">
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[0.68rem] text-muted-foreground">
              {phase}
            </span>
          </p>
          {items?.length ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
