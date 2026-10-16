"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { GripVertical, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { MetricDef } from "./campaigns-table";

/**
 * Modal "Personalizar" — liga/desliga e reordena (arrastar pelo ⠿) quais
 * métricas aparecem na tabela de /campanhas. Aplica na hora (sem botão
 * "Salvar"): cada toggle/drag já chama onSave, que grava no localStorage
 * compartilhado (column-preferences.ts) — reflete em toda tabela da página
 * (campanha/conjunto/anúncio) porque todas leem a mesma preferência.
 */
export function ColumnCustomizer({
  open,
  onOpenChange,
  metrics,
  order,
  hiddenIds,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: MetricDef[];
  order: string[];
  hiddenIds: Set<string>;
  onSave: (order: string[], hidden: string[]) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);

  const visibleInList = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return order;
    return order.filter((id) => byId.get(id)?.label.toLowerCase().includes(needle));
  }, [order, query, byId]);

  function toggle(id: string) {
    const next = new Set(hiddenIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSave(order, [...next]);
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const next = order.filter((id) => id !== fromId);
    const toIndex = next.indexOf(toId);
    next.splice(toIndex, 0, fromId);
    onSave(next, [...hiddenIds]);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border p-5 pb-4">
            <Dialog.Title className="text-lg font-semibold">
              Personalizar
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar métrica..."
                aria-label="Buscar métrica"
                className="h-9 pl-8"
              />
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleInList.length === 0 ? (
              <li className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma métrica encontrada.
              </li>
            ) : (
              visibleInList.map((id) => {
                const metric = byId.get(id);
                if (!metric) return null;
                const visible = !hiddenIds.has(id);
                return (
                  <li
                    key={id}
                    draggable={!query}
                    onDragStart={() => setDraggedId(id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedId) reorder(draggedId, id);
                      setDraggedId(null);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors",
                      draggedId === id ? "opacity-40" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 text-muted-foreground/60",
                        query ? "cursor-default opacity-30" : "cursor-grab",
                      )}
                      title={query ? undefined : "Arraste pra reordenar"}
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span className="flex-1 truncate text-sm">
                      {metric.label}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visible}
                      aria-label={`${visible ? "Ocultar" : "Mostrar"} ${metric.label}`}
                      onClick={() => toggle(id)}
                      className={cn(
                        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                        visible ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                          visible ? "translate-x-4" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Restaurar colunas padrão
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
