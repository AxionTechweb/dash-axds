import {
  Activity,
  BadgeDollarSign,
  Banknote,
  Globe2,
  Megaphone,
  Radio,
  ShoppingBag,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";

import { KpiCard } from "@/components/panel/kpi-card";
import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatCurrency, formatNumber, formatRoas } from "@/lib/format";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { resolvePeriod } from "@/lib/period";

export const metadata: Metadata = { title: "Dashboard" };

/** Next.js 16: searchParams é assíncrono. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);

  const activeArea = await getActiveArea();
  const settings = activeArea ? await getSettings(activeArea.id) : null;
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const taxRate = settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate;

  // A apuração real (purchases + insights da Meta) chega na Fase 5.
  const revenue = 0;
  const adSpend = 0;
  const tax = 0;
  const profit = revenue - adSpend - tax;
  const sales = 0;
  const roas = 0;
  const cpa = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Visão geral</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {period.label} ·{" "}
          {period.from.toLocaleDateString("pt-BR")} –{" "}
          {period.to.toLocaleDateString("pt-BR")}
        </p>
      </div>

      {/* Grade de KPIs: 3 colunas × 2 linhas (empilha no mobile) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Faturamento Bruto"
          value={formatCurrency(revenue, currency)}
          icon={Banknote}
        />
        <KpiCard
          label="Gasto com Ads"
          value={formatCurrency(adSpend, currency)}
          icon={Megaphone}
          sub={`Ads ${formatCurrency(adSpend, currency)} · Imposto ${formatNumber(taxRate, 0)}% (${formatCurrency(tax, currency)})`}
        />
        <KpiCard
          label="Lucro"
          value={formatCurrency(profit, currency)}
          icon={TrendingUp}
          accent="primary"
        />
        <KpiCard
          label="Vendas Aprovadas"
          value={formatNumber(sales)}
          icon={ShoppingBag}
          sensitive={false}
        />
        <KpiCard
          label="ROAS"
          value={formatRoas(roas)}
          icon={Target}
          accent="primary"
        />
        <KpiCard
          label="CPA"
          value={formatCurrency(cpa, currency)}
          icon={BadgeDollarSign}
        />
      </div>

      {/* Linha inferior: gráfico + mapa + feed em tempo real */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Activity className="size-4 text-muted-foreground" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Faturamento vs Gasto
            </span>
          </div>
          <EmptyPanel
            text="O gráfico de evolução (Recharts) entra na Fase 5, junto com a apuração de faturamento e gasto."
          />
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Radio className="size-4 text-muted-foreground" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Vendas em Tempo Real
            </span>
          </div>
          <EmptyPanel text="O feed via Supabase Realtime entra na Fase 5, alimentado pelos webhooks da Fase 4." />
        </Card>

        <Card className="xl:col-span-3">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Globe2 className="size-4 text-muted-foreground" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Vendas por Região
            </span>
          </div>
          <EmptyPanel text="O mapa (react-simple-maps) usa o GEO derivado dos headers da Vercel. Entra na Fase 5." />
        </Card>
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-44 items-center justify-center p-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {text}
      </p>
    </div>
  );
}
