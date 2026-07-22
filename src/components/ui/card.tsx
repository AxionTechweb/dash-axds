import * as React from "react";

import { cn } from "@/lib/utils";

/** Cartão "glass" (blur leve) — base visual do painel. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass", className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 p-4", className)}
      {...props}
    />
  );
}

/** Label em caps pequenas, como nas referências. */
export function CardLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}
