"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { formatCurrency, maskEmail, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SaleRow = {
  id: string;
  created_at: string;
  transaction_id: string;
  produto: string | null;
  email: string | null;
  telefone: string | null;
  valor: number | null;
  moeda: string | null;
  status: string;
  plataforma: string;
  ad_id: string | null;
  match: string | null;
  user_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  raw_webhook: unknown;
};

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-[hsl(var(--primary)/0.15)] text-primary",
  pending: "bg-amber/15 text-amber",
  refunded: "bg-muted text-muted-foreground",
  chargeback: "bg-destructive/15 text-destructive",
  canceled: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  canceled: "Cancelada",
};

/** Exibição SEMPRE mascarada (LGPD). O valor em claro fica só no banco. */
export function SalesTable({ rows }: { rows: SaleRow[] }) {
  const [selected, setSelected] = useState<SaleRow | null>(null);

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma compra no período com os filtros selecionados.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {[
                "Data",
                "Produto",
                "Comprador",
                "Valor",
                "Status",
                "Plataforma",
                "ad_id",
                "Match",
              ].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelected(row)}
                className="cursor-pointer hover:bg-muted/40"
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td className="max-w-56 truncate px-3 py-2">
                  {row.produto ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {maskEmail(row.email)}
                </td>
                <td className="sensitive whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular">
                  {formatCurrency(Number(row.valor) || 0, row.moeda ?? "BRL")}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                      STATUS_STYLE[row.status] ?? "bg-muted",
                    )}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs capitalize text-muted-foreground">
                  {row.plataforma}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {row.ad_id ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {row.match ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SaleDialog sale={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="truncate font-mono text-xs">{value}</p>
    </div>
  );
}

function SaleDialog({
  sale,
  onClose,
}: {
  sale: SaleRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(sale)} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">
            Detalhes da compra
          </Dialog.Title>
          <Dialog.Description className="mt-1 font-mono text-xs text-muted-foreground">
            {sale?.transaction_id}
          </Dialog.Description>

          {sale ? (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Produto" value={sale.produto ?? "—"} />
                <Field
                  label="Valor"
                  value={formatCurrency(
                    Number(sale.valor) || 0,
                    sale.moeda ?? "BRL",
                  )}
                />
                <Field label="Status" value={STATUS_LABEL[sale.status] ?? sale.status} />
                <Field label="E-mail" value={maskEmail(sale.email)} />
                <Field label="Telefone" value={maskPhone(sale.telefone)} />
                <Field label="Plataforma" value={sale.plataforma} />
                <Field label="ad_id" value={sale.ad_id ?? "— (orgânico/direto)"} />
                <Field label="Match" value={sale.match ?? "—"} />
                <Field label="user_id" value={sale.user_id ?? "—"} />
              </div>

              <div>
                <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  UTMs
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label="source" value={sale.utm_source ?? "—"} />
                  <Field label="medium" value={sale.utm_medium ?? "—"} />
                  <Field label="campaign" value={sale.utm_campaign ?? "—"} />
                  <Field label="term" value={sale.utm_term ?? "—"} />
                  <Field label="content" value={sale.utm_content ?? "—"} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payload bruto do webhook
                </p>
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-[hsl(var(--muted)/0.4)] p-3 font-mono text-[0.68rem] text-muted-foreground">
                  {JSON.stringify(sale.raw_webhook, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
