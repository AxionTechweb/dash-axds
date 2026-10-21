"use client";

import { ImageOff } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CreativeRow = {
  id: string;
  name: string;
  accountLabel: string;
  status: string;
  thumbnailUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number;
  cpc: number;
  /** % de sessões que ultrapassaram 3s de reprodução, relativo às views — null sem dado da Vturb pra esse anúncio. */
  hookRate: number | null;
  sales: number;
  revenue: number;
  roasFront: number;
  roasBackend: number;
};

const PAGE_SIZE = 12;

export function CreativeCards({
  rows,
  currency,
}: {
  rows: CreativeRow[];
  currency: string;
}) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE),
    [rows, current],
  );

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhum criativo com gasto ou impressão no período.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((row) => (
          <CreativeCard key={row.id} row={row} currency={currency} />
        ))}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Página {current + 1} de {pageCount} · {formatNumber(rows.length)} criativos
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
    </div>
  );
}

function StatRow({
  label,
  value,
  sensitive,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular", sensitive && "sensitive")}>{value}</span>
    </div>
  );
}

function Bar({ label, value, display }: { label: string; value: number; display: string }) {
  // Barra só visual (não é uma escala comparável entre métricas diferentes,
  // mesmo espírito do print de referência) — satura em 100% pra nunca
  // estourar o container.
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="fill-neon h-full rounded-full" style={{ width: `${width}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono tabular">{display}</span>
    </div>
  );
}

function RoasBox({ label, value }: { label: string; value: number }) {
  const positive = value >= 1;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        positive
          ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.1)]"
          : "border-destructive/35 bg-destructive/10",
      )}
    >
      <p className="micro-label text-[0.65rem]">{label}</p>
      <p className={cn("font-mono text-lg font-semibold tabular", positive ? "text-primary" : "text-destructive")}>
        {formatRoas(value)}
      </p>
    </div>
  );
}

function CreativeCard({ row, currency }: { row: CreativeRow; currency: string }) {
  const active = row.status.toUpperCase() === "ACTIVE";

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full bg-muted">
        {row.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura vem direto do CDN da Meta, sem domínio fixo pra configurar no next/image.
          <img
            src={row.thumbnailUrl}
            alt={row.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageOff className="size-8" />
          </div>
        )}
        <span
          className={cn(
            "absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium backdrop-blur",
            active ? "bg-primary/20 text-primary" : "bg-black/40 text-white/80",
          )}
        >
          <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-white/50")} />
          {row.status}
        </span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
          <p className="truncate text-sm font-semibold text-white">{row.name}</p>
          <p className="truncate text-[0.65rem] text-white/70">{row.accountLabel}</p>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-baseline justify-between">
          <span className="micro-label">Gasto</span>
          <span className="sensitive font-mono text-base font-semibold tabular">
            {formatCurrency(row.spend, currency)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <RoasBox label="ROAS Front" value={row.roasFront} />
          <RoasBox label="ROAS Backend" value={row.roasBackend} />
        </div>

        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Vendas</span>
          <span className="font-mono tabular">
            {formatNumber(row.sales)}
            <span className="sensitive ml-2 text-muted-foreground">
              ({formatCurrency(row.revenue, currency)})
            </span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs">
          <StatRow label="CPM" value={formatCurrency(row.cpm, currency)} sensitive />
          <StatRow label="CPC" value={formatCurrency(row.cpc, currency)} sensitive />
        </div>

        <div className="space-y-1.5">
          <Bar label="CTR" value={row.ctr} display={formatPercent(row.ctr, 2)} />
          <Bar
            label="Hook Rate"
            value={row.hookRate ?? 0}
            display={row.hookRate !== null ? formatPercent(row.hookRate, 1) : "—"}
          />
        </div>
      </div>
    </Card>
  );
}
