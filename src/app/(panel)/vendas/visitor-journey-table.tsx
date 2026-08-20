"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { VisitorJourney } from "@/lib/events";

import { buildTimeline, EventBadge, EventsTimeline, fmtDateTime, ProductsList } from "./journey-shared";

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
  const timeline = journey ? buildTimeline(journey.events, journey.purchases) : [];

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
              <ProductsList purchases={journey.purchases} />
              <EventsTimeline entries={timeline} />
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
