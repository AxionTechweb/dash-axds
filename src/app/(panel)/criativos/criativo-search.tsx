"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

export type CreativeOption = { id: string; name: string };

/**
 * Mesmo padrão do autocomplete de /campanhas (campaign-filters.tsx): sugere
 * nomes reais enquanto digita, filtra ao parar de digitar (debounce) e
 * navega na hora ao clicar numa sugestão.
 */
export function CriativoSearch({ options }: { options: CreativeOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [text, setText] = useState(searchParams.get("q") ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return [];
    return options
      .filter((o) => o.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [text, options]);

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(`${pathname}?${params.toString()}`);
  }

  function selectOption(option: CreativeOption) {
    setText(option.name);
    setShowSuggestions(false);
    apply(option.name);
  }

  return (
    <div className="relative min-w-44 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="q"
        value={text}
        placeholder="Buscar criativo..."
        aria-label="Buscar criativo"
        className="h-9 pl-8"
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => {
          // Delay pra o onMouseDown da sugestão disparar antes do blur escondê-la.
          window.setTimeout(() => setShowSuggestions(false), 150);
        }}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setText(value);
          setShowSuggestions(true);
          clearTimeout(
            (window as unknown as { __criativoSearchTimer?: number })
              .__criativoSearchTimer,
          );
          (
            window as unknown as { __criativoSearchTimer?: number }
          ).__criativoSearchTimer = window.setTimeout(() => apply(value), 400);
        }}
      />

      {showSuggestions && suggestions.length > 0 ? (
        <ul className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {suggestions.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(option);
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted)/0.6)]"
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
