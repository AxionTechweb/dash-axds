"use client";

import { LayoutGrid, LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut } from "@/app/(panel)/actions";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Navegação no celular no padrão do whatsapp-lead-hub: dock flutuante embaixo
 * com os 3 atalhos mais usados + "Mais", que abre um painel com o resto.
 * Fundo sólido (sem vidro/blur, pela regra visual do projeto).
 */
const PINNED_HREFS = ["/dashboard", "/campanhas", "/vendas"];

export function MobileDock({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Fecha o painel ao trocar de rota.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  // Esc fecha o painel.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const pinned = PINNED_HREFS.map((href) => NAV_ITEMS.find((i) => i.href === href)).filter(
    (i): i is (typeof NAV_ITEMS)[number] => Boolean(i),
  );
  const more = NAV_ITEMS.filter((i) => !PINNED_HREFS.includes(i.href));
  const moreActive = moreOpen || more.some((i) => isActive(i.href));

  return (
    <>
      {moreOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMoreOpen(false)} />
          <div
            role="dialog"
            aria-label="Mais opções"
            className="fixed left-1/2 z-50 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-[26px] border border-border bg-card p-4 shadow-2xl lg:hidden"
            style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">Mais opções</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {more.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[10.5px] font-medium transition-colors active:bg-muted",
                    isActive(item.href) ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-[13px] border",
                      isActive(item.href)
                        ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)]"
                        : "border-border bg-muted",
                    )}
                  >
                    <item.icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={userEmail}>
                {userEmail}
              </span>
              <ThemeToggle />
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-destructive active:bg-[hsl(var(--destructive)/0.1)]"
                >
                  <LogOut className="size-3.5" /> Sair
                </button>
              </form>
            </div>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Navegação"
        className="fixed left-1/2 z-50 flex w-[min(400px,calc(100%-24px))] -translate-x-1/2 items-center justify-around gap-1 rounded-full border border-border bg-card px-2 py-2 shadow-2xl lg:hidden"
        style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}
      >
        {pinned.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[9.5px] font-semibold transition-colors",
              isActive(item.href) ? "bg-[hsl(var(--primary)/0.15)] text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label={moreOpen ? "Fechar menu" : "Abrir menu"}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[9.5px] font-semibold transition-colors",
            moreActive ? "bg-[hsl(var(--primary)/0.15)] text-primary" : "text-muted-foreground",
          )}
        >
          {moreOpen ? <X className="size-5" /> : <LayoutGrid className="size-5" />}
          Mais
        </button>
      </nav>
    </>
  );
}
