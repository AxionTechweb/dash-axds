"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";

/** Filtros de Campanhas — todos vivem na URL (compartilhável e legível no servidor). */
export function CampaignFilters({
  accounts,
}: {
  accounts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function apply(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const selectClass =
    "h-9 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Buscar por nome..."
          aria-label="Buscar por nome"
          className="h-9 pl-8"
          onChange={(e) => {
            const value = e.currentTarget.value;
            // Aplica ao parar de digitar (evita navegar a cada tecla).
            clearTimeout(
              (window as unknown as { __searchTimer?: number }).__searchTimer,
            );
            (window as unknown as { __searchTimer?: number }).__searchTimer =
              window.setTimeout(() => apply("q", value || null), 400);
          }}
        />
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
