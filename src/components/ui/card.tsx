import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Cartão base do painel (referência Finex): superfície quase preta com blur,
 * borda de branco em baixa opacidade e cantos 2xl. No hover a borda ganha a cor
 * de acento — é o que dá a sensação de "vivo" do design original.
 *
 * Continua sendo componente de SERVIDOR. O brilho que segue o cursor vive no
 * <Flashlight>, um wrapper cliente separado, para não arrastar todo o sistema
 * de cards para o bundle do browser.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass",
        "hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--foreground)/0.02)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

/** Rótulo micro em mono caixa-alta — assinatura tipográfica da referência. */
export function CardLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("micro-label", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

/**
 * Cabeçalho de seção no estilo da referência: título display em caixa-alta,
 * descrição alinhada à direita e um contador em mono ("001 — 004").
 */
export function SectionHeading({
  title,
  description,
  counter,
  actions,
  className,
}: {
  title: string;
  description?: string;
  counter?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="display-title text-3xl text-foreground md:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {(counter || actions) && (
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          {counter ? <span className="micro-label">{counter}</span> : null}
        </div>
      )}
    </div>
  );
}
