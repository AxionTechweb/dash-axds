import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de formulário no tema da referência: superfície quase transparente
 * sobre o fundo preto, borda de branco em baixa opacidade e foco em ciano.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-3.5 text-sm",
        "transition-colors placeholder:text-muted-foreground/60",
        "hover:border-[hsl(var(--foreground)/0.16)]",
        "focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

/** Rótulo de campo: micro, em mono caixa-alta, como na referência. */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("micro-label mb-2 block", className)} {...props} />;
}
