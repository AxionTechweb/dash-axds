import { Suspense } from "react";

import type { Area } from "@/lib/areas";
import type { Branding } from "@/lib/branding";
import { formatCurrency } from "@/lib/format";

import { HideValuesButton, RefreshButton } from "./header-actions";
import { PeriodSelector } from "./period-selector";
import { MobileNav } from "./sidebar";

type HeaderProps = {
  userName: string;
  branding: Branding;
  areas: Area[];
  activeArea: Area | null;
  userEmail: string;
  /** Faturamento do período. A apuração real chega na Fase 5. */
  revenue: number;
  /** Meta de faturamento (settings da área é a fonte da verdade). */
  goal: number;
  currency: string;
};

/** Barra de progresso da meta de faturamento (preenchimento verde-neon). */
function GoalProgress({
  revenue,
  goal,
  currency,
}: {
  revenue: number;
  goal: number;
  currency: string;
}) {
  const pct = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;

  return (
    <div className="hidden min-w-56 flex-col gap-1 md:flex">
      <div className="flex items-baseline justify-between gap-3 text-[0.68rem]">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
          Meta
        </span>
        <span className="sensitive font-mono text-muted-foreground">
          {formatCurrency(revenue, currency)} / {formatCurrency(goal, currency)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da meta de faturamento"
      >
        <div
          className="fill-neon h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Header({
  userName,
  branding,
  areas,
  activeArea,
  userEmail,
  revenue,
  goal,
  currency,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[hsl(var(--background)/0.75)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
        <MobileNav
          branding={branding}
          areas={areas}
          activeArea={activeArea}
          userEmail={userEmail}
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            Bem vindo{userName ? `, ${userName}` : ""}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {activeArea
              ? `Área ${activeArea.nome} · acompanhe seus resultados`
              : "Crie uma área para começar"}
          </p>
        </div>

        <GoalProgress revenue={revenue} goal={goal} currency={currency} />

        <div className="flex items-center gap-2">
          <Suspense
            fallback={
              <div className="h-9 w-28 rounded-md border border-border bg-muted/40" />
            }
          >
            <PeriodSelector />
          </Suspense>
          <HideValuesButton />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
