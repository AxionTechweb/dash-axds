import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.6)]",
  secondary: "bg-muted text-foreground hover:bg-muted/70",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  outline: "border border-border bg-transparent hover:bg-muted",
  destructive: "bg-destructive text-white hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
  icon: "h-9 w-9 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "secondary", size = "md", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-md font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
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
