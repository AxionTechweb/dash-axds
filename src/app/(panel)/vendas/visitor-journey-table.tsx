"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { VisitorJourney } from "@/lib/events";

/** Cores por nome de evento — os automáticos do snippet têm cor fixa; eventos customizados (ex.: lead) caem num tom neutro. */
const EVENT_STYLE: Record<string, string> = {
  page_view: "bg-[hsl(var(--primary)/0.15)] text-primary",
  view_content: "bg-[hsl(var(--accent-emerald)/0.15)] text-emerald",
  lead: "bg-[hsl(var(--accent-purple)/0.15)] text-purple",
  initiate_checkout: "bg-amber/15 text-amber",
  purchase: "bg-[hsl(var(--accent-emerald)/0.2)] text-emerald",
};
const EVENT_STYLE_DEFAULT = "bg-muted text-muted-foreground";

function EventBadge({ name, label }: { name: string; label?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[0.65rem] font-medium",
        EVENT_STYLE[name] ?? EVENT_STYLE_DEFAULT,
      )}
    >
      {label ?? name}
    </span>
  );
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function VisitorJourneyTable({ rows }: { rows: VisitorJourney[] }) {
  const [selected, setSelected] = useState<VisitorJourney | null>(null);

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nenhum evento no período. Instale o rastreamento (GTM ou snippet) em{" "}
        <strong>Integrações</strong> para começar a capturar.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {["SRC (visitante)", "Origem", "Page Views", "Checkout", "Outros eventos", "Última atividade", "Compra"].map(
                (label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-2 micro-label">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const pageViews = row.eventCounts.page_view ?? 0;
              const checkouts = row.eventCounts.initiate_checkout ?? 0;
              const others = Object.entries(row.eventCounts).filter(
                ([name]) => name !== "page_view" && name !== "initiate_checkout",
              );
              const indecisive = pageViews >= 3 && !row.converted;
              const bestPurchase =
                row.purchases.find((p) => p.status === "approved") ?? row.purchases[0] ?? null;

              return (
                <tr
                  key={row.userId}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.userId}
                  </td>
                  <td className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
                    {row.utmSource ?? "—"}
                    {row.utmCampaign ? ` · ${row.utmCampaign}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={cn(indecisive && "font-semibold text-amber")}>
                      {pageViews}
                    </span>
                    {indecisive ? (
                      <span className="ml-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[0.6rem] font-medium text-amber">
                        indeciso
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{checkouts}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {others.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        others.map(([name, count]) => (
                          <EventBadge
                            key={name}
                            name={name}
                            label={count > 1 ? `${name} ×${count}` : name}
                          />
                        ))
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {fmtDateTime(row.lastSeen)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {bestPurchase ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                          bestPurchase.status === "approved"
                            ? "bg-[hsl(var(--primary)/0.15)] text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {formatCurrency(bestPurchase.valor ?? 0, bestPurchase.moeda ?? "BRL")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <JourneyDialog journey={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function JourneyDialog({
  journey,
  onClose,
}: {
  journey: VisitorJourney | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(journey)} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">Jornada do lead</Dialog.Title>
          <Dialog.Description className="mt-1 font-mono text-xs text-muted-foreground">
            {journey?.userId}
          </Dialog.Description>

          {journey ? (
            <div className="mt-4 space-y-5">
              {journey.purchases.length > 0 ? (
                <div>
                  <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Produtos comprados ({journey.purchases.length})
                  </p>
                  <div className="space-y-2">
                    {journey.purchases.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.produto ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                              p.status === "approved"
                                ? "bg-[hsl(var(--primary)/0.15)] text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {p.status}
                          </span>
                          <span className="font-mono text-sm tabular">
                            {formatCurrency(p.valor ?? 0, p.moeda ?? "BRL")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Histórico de eventos ({journey.events.length})
                </p>
                <div className="space-y-2">
                  {journey.events.map((e, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <EventBadge name={e.eventName} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {fmtDateTime(e.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        origem: {e.utmSource ?? "—"}
                        {e.utmCampaign ? ` · camp: ${e.utmCampaign}` : ""}
                        {e.utmContent ? ` · anúncio: ${e.utmContent}` : ""}
                      </p>
                      {e.geoCity || e.geoRegion ? (
                        <p className="text-xs text-muted-foreground">
                          {[e.geoCity, e.geoRegion, e.geoCountry].filter(Boolean).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
