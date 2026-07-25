import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Botões no padrão da referência Finex: pílulas (rounded-full), tipografia
 * pequena e semibold, e variantes "tintadas" (fundo em 10% da cor + borda em
 * 20%) além das sólidas.
 *
 * `primary` continua usando a cor --primary, que o branding da instância pode
 * sobrescrever — nenhuma cor de marca fica presa no código.
 */
type Variant =
  | "primary"
  | "contrast"
  | "accent"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  /** Ação principal: sólida na cor da marca, com halo suave. */
  primary:
    "bg-primary text-primary-foreground font-semibold hover:brightness-110 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.7)]",
  /** CTA de alto contraste (branco/preto) — o botão-herói da referência. */
  contrast:
    "bg-foreground text-background font-semibold hover:opacity-90 shadow-[0_0_30px_-10px_hsl(var(--foreground)/0.5)]",
  /** Tintada: fundo 10% + borda 20% da cor de acento. */
  accent:
    "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.2)] text-primary hover:bg-[hsl(var(--primary)/0.15)]",
  secondary:
    "bg-muted text-foreground border border-border hover:bg-[hsl(var(--foreground)/0.06)]",
  ghost:
    "text-muted-foreground hover:bg-[hsl(var(--foreground)/0.05)] hover:text-foreground",
  outline:
    "border border-border bg-transparent hover:bg-[hsl(var(--foreground)/0.04)]",
  destructive:
    "bg-[hsl(var(--destructive)/0.12)] border border-[hsl(var(--destructive)/0.25)] text-destructive hover:bg-[hsl(var(--destructive)/0.2)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5",
  md: "h-9.5 px-5 text-sm gap-2",
  lg: "h-11 px-7 text-sm gap-2",
  icon: "size-9 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "secondary", size = "md", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * Grupo de botões segmentado no formato de pílula (a navegação central do
 * dashboard da referência): trilho arredondado com fundo sutil e itens que
 * acendem quando ativos.
 */
export function PillGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-[hsl(var(--foreground)/0.04)] p-1 backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}

export function PillItem({
  className,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
        active
          ? "bg-[hsl(var(--foreground)/0.1)] text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
