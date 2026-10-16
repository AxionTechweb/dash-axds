"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

export type CampaignOption = { id: string; name: string };

/** Filtros de Campanhas — todos vivem na URL (compartilhável e legível no servidor). */
export function CampaignFilters({
  accounts,
  campaignOptions,
}: {
  accounts: { id: string; label: string }[];
  campaignOptions: CampaignOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [text, setText] = useState(searchParams.get("q") ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function apply(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Sugestões por substring (não exige o nome inteiro) — "iogurte" já bate
  // com "Iogurte Bariátrico — Campanha Fria".
  const suggestions = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return [];
    return campaignOptions
      .filter((c) => c.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [text, campaignOptions]);

  function selectCampaign(option: CampaignOption) {
    setText(option.name);
    setShowSuggestions(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("campaign", option.id);
    params.delete("q");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const selectClass =
    "h-9 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          placeholder="Buscar por nome..."
          aria-label="Buscar por nome"
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
            // Aplica ao parar de digitar (evita navegar a cada tecla).
            clearTimeout(
              (window as unknown as { __searchTimer?: number }).__searchTimer,
            );
            (window as unknown as { __searchTimer?: number }).__searchTimer =
              window.setTimeout(() => apply("q", value || null), 400);
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
                    selectCampaign(option);
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

      <select
        aria-label="Filtrar por status"
        className={selectClass}
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(e) => apply("status", e.currentTarget.value)}
      >
        <option value="all">Todos os status</option>
        <option value="active">Ativo</option>
        <option value="paused">Pausado</option>
      </select>

      {accounts.length > 1 ? (
        <select
          aria-label="Filtrar por conta de anúncio"
          className={selectClass}
          defaultValue={searchParams.get("account") ?? ""}
          onChange={(e) => apply("account", e.currentTarget.value || null)}
        >
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
