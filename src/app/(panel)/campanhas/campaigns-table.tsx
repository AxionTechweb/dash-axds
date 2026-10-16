"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Pause,
  Pencil,
  Play,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  setEntityBudget,
  setEntityStatus,
  type MetaWriteState,
} from "./actions";
import { ColumnCustomizer } from "./column-customizer";
import { useColumnPreferences } from "./column-preferences";

export type TableRow = {
  id: string;
  name: string;
  level: string;
  status: string;
  effectiveStatus: string;
  budgetAmount: number | null;
  budgetType: "daily" | "lifetime" | null;
  accountId: string;
  accountLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  sales: number;
  revenue: number;
  checkouts: number;
  /** Page view reportado pelo pixel da Meta. */
  views: number;
  profit: number;
  roas: number;
  cpa: number;
  cpm: number;
  ctr: number;
  cpc: number;
  /** Vendas/faturamento do tier "vd" (VD/front) — por ad_id direto, não muda com o toggle de atribuição. */
  vdSales: number;
  vdRevenue: number;
  upsellSales: number;
  upsellRevenue: number;
  /** Reembolsos + chargebacks, por ad_id direto. */
  refunds: number;
};

/** Vermelho para valores negativos (lucro). */
function negative(value: number) {
  return value < 0 ? "text-destructive" : "";
}

export type MetricDef = {
  id: string;
  label: string;
  numeric: boolean;
  /** Valores financeiros ficam borrados quando "ocultar valores" está ligado. */
  sensitive?: boolean;
  /** Valor cru — usado pra ordenar a tabela. */
  value: (row: TableRow) => number | string;
  /** Texto já formatado pra célula. */
  format: (row: TableRow, currency: string) => string;
  /** Classe extra na célula (ex.: vermelho no lucro negativo). */
  cellClassName?: (row: TableRow) => string;
  /** Como calcular o total do rodapé — se omitido, a coluna fica em branco lá. */
  total?: (rows: TableRow[], currency: string) => string;
};

const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);

/**
 * Catálogo de métricas disponíveis pra tabela de /campanhas — todas
 * derivadas de campos que a página já busca (nenhuma chamada nova à Meta).
 * "Personalizar" liga/desliga e reordena quais aparecem; a ordem aqui dentro
 * só importa como ordem padrão (DEFAULT_COLUMN_IDS) e como a lista aparece
 * no modal antes do usuário reordenar.
 */
export const METRICS: MetricDef[] = [
  {
    id: "account",
    label: "Conta",
    numeric: false,
    value: (r) => r.accountLabel,
    format: (r) => r.accountLabel,
  },
  {
    id: "status",
    label: "Status de Veiculação",
    numeric: false,
    value: (r) => r.effectiveStatus || r.status,
    format: (r) => r.effectiveStatus || r.status,
  },
  {
    id: "budget",
    label: "Orçamento",
    numeric: true,
    sensitive: true,
    value: (r) => r.budgetAmount ?? 0,
    format: (r, currency) =>
      r.budgetAmount === null
        ? "—"
        : `${formatCurrency(r.budgetAmount, currency)}${r.budgetType === "daily" ? "/dia" : " total"}`,
  },
  {
    id: "spend",
    label: "Gasto",
    numeric: true,
    sensitive: true,
    value: (r) => r.spend,
    format: (r, c) => formatCurrency(r.spend, c),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.spend, 0), c),
  },
  {
    id: "sales",
    label: "Vendas",
    numeric: true,
    value: (r) => r.sales,
    format: (r) => formatNumber(r.sales),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.sales, 0)),
  },
  {
    id: "revenue",
    label: "Faturamento",
    numeric: true,
    sensitive: true,
    value: (r) => r.revenue,
    format: (r, c) => formatCurrency(r.revenue, c),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.revenue, 0), c),
  },
  {
    id: "profit",
    label: "Lucro",
    numeric: true,
    sensitive: true,
    value: (r) => r.profit,
    format: (r, c) => formatCurrency(r.profit, c),
    cellClassName: (r) => negative(r.profit),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.profit, 0), c),
  },
  {
    id: "roas",
    label: "ROAS",
    numeric: true,
    value: (r) => r.roas,
    format: (r) => formatRoas(r.roas),
    total: (rows) => {
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      return formatRoas(ratio(revenue, spend));
    },
  },
  {
    id: "checkouts",
    label: "Checkouts",
    numeric: true,
    value: (r) => r.checkouts,
    format: (r) => formatNumber(r.checkouts),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.checkouts, 0)),
  },
  {
    id: "cpa",
    label: "CPA",
    numeric: true,
    sensitive: true,
    value: (r) => r.cpa,
    format: (r, c) => formatCurrency(r.cpa, c),
    total: (rows, c) => {
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const sales = rows.reduce((s, r) => s + r.sales, 0);
      return formatCurrency(ratio(spend, sales), c);
    },
  },
  {
    id: "impressions",
    label: "Impressões",
    numeric: true,
    value: (r) => r.impressions,
    format: (r) => formatNumber(r.impressions),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.impressions, 0)),
  },
  {
    id: "cpm",
    label: "CPM",
    numeric: true,
    sensitive: true,
    value: (r) => r.cpm,
    format: (r, c) => formatCurrency(r.cpm, c),
    total: (rows, c) => {
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      return formatCurrency(ratio(spend, impressions) * 1000, c);
    },
  },
  {
    id: "ctr",
    label: "CTR",
    numeric: true,
    value: (r) => r.ctr,
    format: (r) => formatPercent(r.ctr, 2),
    total: (rows) => {
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      return formatPercent(ratio(clicks, impressions) * 100, 2);
    },
  },
  {
    id: "cpc",
    label: "CPC",
    numeric: true,
    sensitive: true,
    value: (r) => r.cpc,
    format: (r, c) => formatCurrency(r.cpc, c),
    total: (rows, c) => {
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      return formatCurrency(ratio(spend, clicks), c);
    },
  },
  {
    id: "clicks",
    label: "Cliques",
    numeric: true,
    value: (r) => r.clicks,
    format: (r) => formatNumber(r.clicks),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.clicks, 0)),
  },
  {
    id: "views",
    label: "Page Views",
    numeric: true,
    value: (r) => r.views,
    format: (r) => formatNumber(r.views),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.views, 0)),
  },
  {
    id: "aov",
    label: "Ticket Médio (AOV)",
    numeric: true,
    sensitive: true,
    value: (r) => ratio(r.revenue, r.sales),
    format: (r, c) => formatCurrency(ratio(r.revenue, r.sales), c),
    total: (rows, c) => {
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const sales = rows.reduce((s, r) => s + r.sales, 0);
      return formatCurrency(ratio(revenue, sales), c);
    },
  },
  {
    id: "epc",
    label: "EPC",
    numeric: true,
    sensitive: true,
    value: (r) => ratio(r.revenue, r.clicks),
    format: (r, c) => formatCurrency(ratio(r.revenue, r.clicks), c),
    total: (rows, c) => {
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      return formatCurrency(ratio(revenue, clicks), c);
    },
  },
  {
    id: "clicksPerCheckout",
    label: "Cliques por Checkout",
    numeric: true,
    value: (r) => ratio(r.clicks, r.checkouts),
    format: (r) => formatNumber(ratio(r.clicks, r.checkouts), 1),
    total: (rows) => {
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const checkouts = rows.reduce((s, r) => s + r.checkouts, 0);
      return formatNumber(ratio(clicks, checkouts), 1);
    },
  },
  {
    id: "checkoutsPerSale",
    label: "Checkouts por Conversão",
    numeric: true,
    value: (r) => ratio(r.checkouts, r.sales),
    format: (r) => formatNumber(ratio(r.checkouts, r.sales), 1),
    total: (rows) => {
      const checkouts = rows.reduce((s, r) => s + r.checkouts, 0);
      const sales = rows.reduce((s, r) => s + r.sales, 0);
      return formatNumber(ratio(checkouts, sales), 1);
    },
  },
  {
    id: "clicksPerSale",
    label: "Cliques por Conversão",
    numeric: true,
    value: (r) => ratio(r.clicks, r.sales),
    format: (r) => formatNumber(ratio(r.clicks, r.sales), 1),
    total: (rows) => {
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const sales = rows.reduce((s, r) => s + r.sales, 0);
      return formatNumber(ratio(clicks, sales), 1);
    },
  },
  {
    id: "costPerCheckout",
    label: "Custo por Checkout Iniciado",
    numeric: true,
    sensitive: true,
    value: (r) => ratio(r.spend, r.checkouts),
    format: (r, c) => formatCurrency(ratio(r.spend, r.checkouts), c),
    total: (rows, c) => {
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const checkouts = rows.reduce((s, r) => s + r.checkouts, 0);
      return formatCurrency(ratio(spend, checkouts), c);
    },
  },
  {
    id: "vdSales",
    label: "Vendas Front (VD)",
    numeric: true,
    value: (r) => r.vdSales,
    format: (r) => formatNumber(r.vdSales),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.vdSales, 0)),
  },
  {
    id: "vdRevenue",
    label: "Valor de Vendas Front (VD)",
    numeric: true,
    sensitive: true,
    value: (r) => r.vdRevenue,
    format: (r, c) => formatCurrency(r.vdRevenue, c),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.vdRevenue, 0), c),
  },
  {
    id: "upsellSales",
    label: "Vendas Upsell",
    numeric: true,
    value: (r) => r.upsellSales,
    format: (r) => formatNumber(r.upsellSales),
    total: (rows) => formatNumber(rows.reduce((s, r) => s + r.upsellSales, 0)),
  },
  {
    id: "upsellRevenue",
    label: "Valor de Vendas Upsell",
    numeric: true,
    sensitive: true,
    value: (r) => r.upsellRevenue,
    format: (r, c) => formatCurrency(r.upsellRevenue, c),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.upsellRevenue, 0), c),
  },
  {
    id: "refunds",
    label: "Reembolsos",
    numeric: true,
    sensitive: true,
    value: (r) => r.refunds,
    format: (r, c) => formatCurrency(r.refunds, c),
    cellClassName: (r) => (r.refunds > 0 ? "text-destructive" : ""),
    total: (rows, c) => formatCurrency(rows.reduce((s, r) => s + r.refunds, 0), c),
  },
];

const METRICS_BY_ID = new Map(METRICS.map((m) => [m.id, m]));
const ALL_METRIC_IDS = METRICS.map((m) => m.id);

/** Seleção padrão — exatamente as colunas que a tabela sempre teve. */
const DEFAULT_VISIBLE_IDS = new Set([
  "spend",
  "sales",
  "revenue",
  "profit",
  "roas",
  "checkouts",
  "cpa",
  "impressions",
  "cpm",
  "ctr",
  "cpc",
]);
const DEFAULT_HIDDEN_IDS = ALL_METRIC_IDS.filter(
  (id) => !DEFAULT_VISIBLE_IDS.has(id),
);

const PAGE_SIZE = 25;

export function CampaignsTable({
  rows,
  currency,
  canEdit,
}: {
  rows: TableRow[];
  currency: string;
  canEdit: boolean;
}) {
  const { fullOrder, hiddenIds, activeColumnIds, setPrefs, resetToDefault } =
    useColumnPreferences(ALL_METRIC_IDS, DEFAULT_HIDDEN_IDS);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const activeColumns = useMemo(
    () =>
      activeColumnIds
        .map((id) => METRICS_BY_ID.get(id))
        .filter((m): m is MetricDef => Boolean(m)),
    [activeColumnIds],
  );

  const [sortKey, setSortKey] = useState<string>("spend");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sortMetric = METRICS_BY_ID.get(sortKey);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "name") {
        return asc
          ? a.name.localeCompare(b.name, "pt-BR")
          : b.name.localeCompare(a.name, "pt-BR");
      }
      const x = sortMetric ? sortMetric.value(a) : 0;
      const y = sortMetric ? sortMetric.value(b) : 0;
      if (typeof x === "string" || typeof y === "string") {
        return asc
          ? String(x).localeCompare(String(y), "pt-BR")
          : String(y).localeCompare(String(x), "pt-BR");
      }
      return asc ? Number(x) - Number(y) : Number(y) - Number(x);
    });
    return copy;
  }, [rows, sortKey, asc, sortMetric]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  function toggleSort(key: string) {
    if (key === sortKey) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(false);
    }
    setPage(0);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end px-3 pt-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCustomizerOpen(true)}
          className="gap-1.5"
        >
          <Settings2 className="size-3.5" />
          Personalizar
        </Button>
      </div>

      <ColumnCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        metrics={METRICS}
        order={fullOrder}
        hiddenIds={hiddenIds}
        onSave={setPrefs}
        onReset={resetToDefault}
      />

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma linha para os filtros selecionados.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="whitespace-nowrap px-3 py-2 micro-label">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      Nome
                      {sortKey === "name" ? (
                        asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : null}
                    </button>
                  </th>
                  {activeColumns.map((col) => (
                    <th
                      key={col.id}
                      className={cn(
                        "whitespace-nowrap px-3 py-2 micro-label",
                        col.numeric && "text-right",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          col.numeric && "flex-row-reverse",
                        )}
                      >
                        {col.label}
                        {sortKey === col.id ? (
                          asc ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                  {canEdit ? (
                    <th className="px-3 py-2 text-right micro-label">Ações</th>
                  ) : null}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {visible.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="max-w-72 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusDot status={row.effectiveStatus || row.status} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.name}</p>
                          <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                            {row.accountLabel}
                          </p>
                        </div>
                      </div>
                    </td>
                    {activeColumns.map((col) => (
                      <Num
                        key={col.id}
                        className={cn(
                          col.sensitive && "sensitive",
                          col.cellClassName?.(row),
                        )}
                        align={col.numeric}
                      >
                        {col.format(row, currency)}
                      </Num>
                    ))}

                    {canEdit ? (
                      <td className="px-3 py-2">
                        <RowActions row={row} currency={currency} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    Total ({formatNumber(rows.length)})
                  </td>
                  {activeColumns.map((col) => (
                    <Num
                      key={col.id}
                      className={cn(col.sensitive && "sensitive")}
                      align={col.numeric}
                    >
                      {col.total ? col.total(rows, currency) : ""}
                    </Num>
                  ))}
                  {canEdit ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 px-3 pb-3 text-xs text-muted-foreground">
              <span>
                Página {current + 1} de {pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={current >= pageCount - 1}
                  onClick={() => setPage(current + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Num({
  children,
  className,
  align = true,
}: {
  children: React.ReactNode;
  className?: string;
  align?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2 font-mono text-xs tabular",
        align ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

function StatusDot({ status }: { status: string }) {
  const active = status.toUpperCase() === "ACTIVE";
  return (
    <span
      title={status}
      className={cn(
        "size-2 shrink-0 rounded-full",
        active ? "bg-primary" : "bg-muted-foreground/50",
      )}
    />
  );
}

/* --------------------------------------------------------- edição inline */

function RowActions({ row, currency }: { row: TableRow; currency: string }) {
  const isActive = row.status.toUpperCase() === "ACTIVE";

  return (
    <div className="flex justify-end gap-1">
      <StatusDialog row={row} isActive={isActive} />
      <BudgetDialog row={row} currency={currency} />
    </div>
  );
}

/** Ativar/pausar — SEMPRE com confirmação antes de escrever na Meta. */
function StatusDialog({ row, isActive }: { row: TableRow; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MetaWriteState, FormData>(
    setEntityStatus,
    {},
  );

  const next = isActive ? "PAUSED" : "ACTIVE";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title={isActive ? "Pausar" : "Ativar"}
        >
          {isActive ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert className="size-4 text-amber" />
            {isActive ? "Pausar" : "Ativar"} na Meta?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Esta ação altera <strong>de verdade</strong> o status de “{row.name}”
            na sua conta de anúncios ({row.accountLabel}) e fica registrada no
            log de auditoria.
          </Dialog.Description>

          {state.error ? (
            <p className="mt-3 text-xs text-destructive">{state.error}</p>
          ) : null}

          <form
            action={(fd) => {
              formAction(fd);
              setOpen(false);
            }}
            className="mt-5 flex justify-end gap-2"
          >
            <input type="hidden" name="accountId" value={row.accountId} />
            <input type="hidden" name="entityId" value={row.id} />
            <input type="hidden" name="level" value={row.level} />
            <input type="hidden" name="status" value={next} />
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancelar
              </Button>
            </Dialog.Close>
            <Button
              type="submit"
              variant={isActive ? "destructive" : "primary"}
              size="sm"
              disabled={pending}
            >
              {pending ? "Enviando..." : isActive ? "Pausar" : "Ativar"}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Edição de orçamento — também com confirmação explícita. */
function BudgetDialog({ row, currency }: { row: TableRow; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MetaWriteState, FormData>(
    setEntityBudget,
    {},
  );

  const disabled = row.budgetType === null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          title={
            disabled
              ? "Sem orçamento próprio neste nível"
              : "Editar orçamento"
          }
        >
          <Pencil className="size-3.5" />
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">
            Editar orçamento
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            “{row.name}” · orçamento{" "}
            {row.budgetType === "daily" ? "diário" : "total"}. A alteração é
            aplicada na Meta e registrada no log de auditoria.
          </Dialog.Description>

          <form
            action={(fd) => {
              formAction(fd);
              setOpen(false);
            }}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="accountId" value={row.accountId} />
            <input type="hidden" name="entityId" value={row.id} />
            <input type="hidden" name="level" value={row.level} />
            <input
              type="hidden"
              name="budgetType"
              value={row.budgetType ?? "daily"}
            />

            <div>
              <Label htmlFor={`budget-${row.id}`}>
                Novo orçamento ({currency})
              </Label>
              <Input
                id={`budget-${row.id}`}
                name="amount"
                type="number"
                step="0.01"
                min="1"
                required
                defaultValue={row.budgetAmount ?? undefined}
              />
            </div>

            {state.error ? (
              <p className="text-xs text-destructive">{state.error}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={pending}
              >
                {pending ? "Salvando..." : "Confirmar alteração"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
