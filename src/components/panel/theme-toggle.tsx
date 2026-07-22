"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Alterna tema escuro/claro (escuro é o padrão) e persiste em localStorage.
 * Sem estado em React: o tema vive no atributo data-theme do <html> e a troca
 * de ícone é feita por CSS — evita mismatch de hidratação.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    const next = isLight ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage indisponível — a troca vale só para esta sessão.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema"
      className={`inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className ?? ""}`}
    >
      <Sun className="size-4 theme-dark-only" />
      <Moon className="size-4 theme-light-only" />
    </button>
  );
}
