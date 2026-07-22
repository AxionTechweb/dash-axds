import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding";

/**
 * Marca da instância (white label): usa os logos configurados no painel e cai
 * no nome do produto quando não houver logo. A troca claro/escuro é feita por
 * CSS (data-theme), sem JS.
 */
export function Brand({
  branding,
  className,
  imgClassName = "h-7 w-auto",
}: {
  branding: Branding;
  className?: string;
  imgClassName?: string;
}) {
  const hasLogo = branding.logo_dark_url || branding.logo_light_url;

  if (hasLogo) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        {branding.logo_dark_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_dark_url}
            alt={branding.product_name}
            className={cn(imgClassName, "theme-dark-only")}
          />
        ) : null}
        {branding.logo_light_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_light_url}
            alt={branding.product_name}
            className={cn(imgClassName, "theme-light-only")}
          />
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg font-extrabold tracking-tight",
        className,
      )}
    >
      <span className="size-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
      {branding.product_name}
    </span>
  );
}
