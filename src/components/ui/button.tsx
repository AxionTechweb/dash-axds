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
  /** Ação principal: gradiente de ouro metálico Axion com halo e leve press effect. */
  primary:
    "bg-gradient-to-b from-[hsl(var(--gold-light))] to-[hsl(var(--gold))] text-black font-semibold hover:brightness-110 active:scale-[0.98] shadow-[0_0_24px_-4px_rgba(212,175,55,0.55)]",
  /** CTA de alto contraste (pergaminho/preto absoluto). */
  contrast:
    "bg-[#f3f1ec] text-[#000000] font-semibold hover:bg-white active:scale-[0.98] shadow-[0_0_30px_-10px_rgba(243,241,236,0.4)]",
  /** Tintada com ouro metálico da Axion. */
  accent:
    "bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.3)] text-[hsl(var(--gold-light))] hover:bg-[rgba(212,175,55,0.2)] hover:border-[rgba(212,175,55,0.5)] active:scale-[0.98]",
  secondary:
    "bg-muted text-foreground border border-border hover:border-[rgba(212,175,55,0.3)] hover:bg-[rgba(212,175,55,0.05)]",
  ghost:
    "text-muted-foreground hover:bg-[rgba(212,175,55,0.08)] hover:text-foreground",
  outline:
    "border border-border bg-transparent hover:border-[rgba(212,175,55,0.35)] hover:bg-[rgba(212,175,55,0.06)]",
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
          ? "bg-gradient-to-b from-[hsl(var(--gold-light))] to-[hsl(var(--gold))] text-black font-semibold shadow-[0_0_15px_-3px_rgba(212,175,55,0.4)]"
          : "text-muted-foreground hover:text-foreground hover:bg-[rgba(212,175,55,0.06)]",
        className,
      )}
      {...props}
    />
  );
}
