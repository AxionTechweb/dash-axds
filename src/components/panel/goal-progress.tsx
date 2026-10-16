"use client";

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCurrency } from "@/lib/format";

import { updateRevenueGoal } from "./goal-actions";

/**
 * Barra de progresso da meta. Segue o padrão da referência: rótulo micro em
 * mono caixa-alta, valor tabular e trilho fino com preenchimento em
 * gradiente. Clicável: abre um input inline pra editar a meta na hora, sem
 * precisar ir em Configurações.
 */
export function GoalProgress({
  revenue,
  goal,
  currency,
}: {
  revenue: number;
  goal: number;
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal || ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pct = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;

  function startEdit() {
    setValue(String(goal || ""));
    setError(null);
    setEditing(true);
  }

  function save() {
    const normalizado = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalizado);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const result = await updateRevenueGoal(parsed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="hidden min-w-56 flex-col gap-1.5 md:flex">
        <div className="flex items-center justify-between gap-2">
          <span className="micro-label">Meta</span>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              disabled={pending}
              placeholder="0,00"
              className="h-6 w-24 rounded border border-border bg-background px-1.5 text-right font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending}
              aria-label="Salvar meta"
              className="text-primary hover:opacity-80 disabled:opacity-50"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              aria-label="Cancelar edição da meta"
              className="text-muted-foreground hover:opacity-80 disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
        {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
        <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.08)]">
          <div
            className="fill-neon h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="hidden min-w-56 flex-col gap-2 md:flex">
      <button
        type="button"
        onClick={startEdit}
        title="Editar meta de faturamento"
        className="group flex items-baseline justify-between gap-3 text-left"
      >
        <span className="micro-label">Meta</span>
        <span className="sensitive flex items-center gap-1 font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
          {formatCurrency(revenue, currency)} / {formatCurrency(goal, currency)}
          <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </span>
      </button>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.08)]"
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
