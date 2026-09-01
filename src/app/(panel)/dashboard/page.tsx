import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  CalendarDays,
  Clock,
  CreditCard,
  Eye,
  Filter,
  Globe2,
  ListChecks,
  LogOut,
  Megaphone,
  MousePointer2,
  MousePointerClick,
  Package,
  Radio,
  Receipt,
  RotateCcw,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Target,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { FunnelFlow } from "@/components/panel/funnel-flow";
import { KpiCard } from "@/components/panel/kpi-card";
import { OriginDonut } from "@/components/panel/origin-donut";
import { PaymentMethodDonut } from "@/components/panel/payment-method-donut";
import { ProductBreakdown } from "@/components/panel/product-breakdown";
import { RealtimeSales } from "@/components/panel/realtime-sales";
import { RegionBreakdown } from "@/components/panel/region-breakdown";
import { RevenueChart } from "@/components/panel/revenue-chart";
import { HourSalesChart, WeekdaySalesChart } from "@/components/panel/sales-timing-charts";
import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getRoasSegments } from "@/lib/attribution";
import { formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/format";
import { getAreaInsights } from "@/lib/meta/client";
import {
  EMPTY_METRICS,
  getPurchaseMetrics,
  getSalesTiming,
  mergeDailySpend,
} from "@/lib/metrics";
import { resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

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
  const gatewayFeePct = settings?.gateway_fee_pct ?? DEFAULT_SETTINGS.gateway_fee_pct;
  const gatewayFeeFixed = settings?.gateway_fee_fixed ?? DEFAULT_SETTINGS.gateway_fee_fixed;

  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área no seletor do topo da sidebar para ver o dashboard.
        </p>
      </Card>
    );
  }

  // Dados próprios (Last Click) + mídia e funil (pixel) da Meta, em paralelo.
  const [metrics, meta, timing, roasSegments] = await Promise.all([
    getPurchaseMetrics(activeArea.id, period.from, period.to),
    getAreaInsights(activeArea.id, period.from, period.to),
    getSalesTiming(activeArea.id, period.from, period.to),
    getRoasSegments(activeArea.id, period.from, period.to),
  ]);

  const cartRecovery = { count: roasSegments.recoveryCount, revenue: roasSegments.recoveryRevenue };

  const safeMetrics = metrics ?? EMPTY_METRICS;

  const revenue = safeMetrics.revenue;
  const adSpend = meta.insights.spend;
  const sales = safeMetrics.sales;
  // Lucro = Faturamento − Gasto com Ads − Imposto sobre faturamento (alíquota
  // configurável) − taxa do gateway de pagamento (% + fixa por venda, ex.:
  // PayT). Conta em dólar não paga o imposto que a Meta retinha sobre contas
  // brasileiras — sem esse desconto aqui.
  const tax = revenue * (Number(taxRate) / 100);
  const gatewayFees = revenue * (Number(gatewayFeePct) / 100) + Number(gatewayFeeFixed) * sales;
  const profit = revenue - adSpend - tax - gatewayFees;

  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const cpa = sales > 0 ? adSpend / sales : 0;
  const ticketMedio = sales > 0 ? revenue / sales : 0;

  // ROAS Front (venda principal, R$197) vs ROAS Backend (Upsell + Downsell +
  // Recuperação de carrinho via Umbler) — mutuamente exclusivos: uma venda
  // recuperada nunca conta como Front, mesmo que seja de R$197 (decisão do
  // usuário, evita contar a mesma receita nos dois ROAS).
  const roasBackendRevenue =
    roasSegments.upsellRevenue + roasSegments.downsellRevenue + roasSegments.recoveryRevenue;
  const roasFront = adSpend > 0 ? roasSegments.frontRevenue / adSpend : 0;
  const roasBackend = adSpend > 0 ? roasBackendRevenue / adSpend : 0;

  const impressions = meta.insights.impressions;
  const clicks = meta.insights.clicks;
  const cpm = impressions > 0 ? (adSpend / impressions) * 1000 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? adSpend / clicks : 0;
  // Views/checkouts vêm do pixel/CAPI da própria Meta — funciona sem o
  // snippet de captura própria (que é opcional).
  const cpv =
    meta.insights.landingPageView > 0
      ? adSpend / meta.insights.landingPageView
      : 0;
  const cpi =
    meta.insights.initiateCheckout > 0
      ? adSpend / meta.insights.initiateCheckout
      : 0;

  const daily = mergeDailySpend(safeMetrics.daily, meta.dailySpend);
  // Séries diárias para as sparklines dos cards — cada métrica na sua
  // própria escala, em vez de forçar Vendas/ROAS/CPA num único gráfico.
  const salesSeries = daily.map((d) => d.sales);
  const roasSeries = daily.map((d) => (d.spend > 0 ? d.revenue / d.spend : 0));
  const cpaSeries = daily.map((d) => (d.sales > 0 ? d.spend / d.sales : 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Visão geral</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {period.label} · {period.from.toLocaleDateString("pt-BR")} –{" "}
          {period.to.toLocaleDateString("pt-BR")}
        </p>
      </div>

      {!meta.configured ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhuma conta de anúncio da Meta conectada nesta área — gasto, ROAS
            e CPA ficam zerados. Conecte em <strong>Integrações</strong>.
          </p>
        </Card>
      ) : null}

      {meta.errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Falha ao ler insights da Meta</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {meta.errors.map((err) => (
                <li key={err} className="truncate font-mono">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

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
          sub={
            meta.fx
              ? `US$ ${meta.fx.usdSpend.toFixed(2)} · câmbio R$ ${meta.fx.rate.toFixed(4)}`
              : undefined
          }
        />
        <KpiCard
          label="Lucro"
          value={formatCurrency(profit, currency)}
          icon={TrendingUp}
          accent={profit < 0 ? "destructive" : "primary"}
          sub={`Ads ${formatCurrency(adSpend, currency)} · Imposto ${formatNumber(Number(taxRate))}% (${formatCurrency(tax, currency)}) · Gateway ${formatCurrency(gatewayFees, currency)}`}
        />
        <KpiCard
          label="Vendas Aprovadas"
          value={formatNumber(sales)}
          icon={ShoppingBag}
          sensitive={false}
          series={salesSeries}
        />
        <KpiCard
          label="ROAS"
          value={formatRoas(roas)}
          icon={Target}
          accent={roas > 0 && roas < 1 ? "destructive" : "primary"}
          series={roasSeries}
        />
        <KpiCard
          label="ROAS Front"
          value={formatRoas(roasFront)}
          icon={Target}
          accent={roasFront > 0 && roasFront < 1 ? "destructive" : "primary"}
          sensitive={false}
          sub={`${formatCurrency(roasSegments.frontRevenue, currency)} (${formatNumber(roasSegments.frontCount)})`}
        />
        <KpiCard
          label="ROAS Backend"
          value={formatRoas(roasBackend)}
          icon={Target}
          accent={roasBackend > 0 && roasBackend < 1 ? "destructive" : "primary"}
          sensitive={false}
          sub={`${formatCurrency(roasBackendRevenue, currency)} (Upsell+Downsell+Recuperação)`}
        />
        <KpiCard
          label="CPA"
          value={formatCurrency(cpa, currency)}
          icon={BadgeDollarSign}
          series={cpaSeries}
        />
      </div>

      {/* Funil de fluxo: cliques no anúncio → visita → checkout → compra */}
      <Card>
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Filter className="size-4 text-muted-foreground" />
          <span className="micro-label">Funil de Fluxo</span>
        </div>
        <FunnelFlow
          clicks={clicks}
          views={meta.insights.landingPageView}
          checkouts={meta.insights.initiateCheckout}
          purchases={sales}
        />
      </Card>

      {/* Receita: recorte adicional sobre as vendas do período */}
      <div className="space-y-2">
        <span className="micro-label">Receita</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Ticket Médio"
            value={formatCurrency(ticketMedio, currency)}
            icon={Receipt}
          />
          <KpiCard
            label="Vendas Totais"
            value={formatNumber(sales)}
            icon={ShoppingCart}
            sensitive={false}
          />
          <KpiCard
            label="Vendas Únicas"
            value={formatNumber(safeMetrics.uniqueSales)}
            icon={Users}
            sensitive={false}
            sub="Clientes distintos, por e-mail"
          />
          <KpiCard
            label="Reembolsos"
            value={formatCurrency(safeMetrics.refundedValue, currency)}
            icon={Undo2}
            accent="destructive"
            sub={`${formatNumber(safeMetrics.refundedCount)} reembolso${safeMetrics.refundedCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="Vendas Upsell"
            value={formatCurrency(safeMetrics.upsellRevenue, currency)}
            icon={ArrowUpRight}
            accent="emerald"
            sensitive={false}
            sub={`${formatNumber(safeMetrics.upsellCount)} venda${safeMetrics.upsellCount === 1 ? "" : "s"} (R$297)`}
          />
          <KpiCard
            label="Vendas Downsell"
            value={formatCurrency(safeMetrics.downsellRevenue, currency)}
            icon={ArrowDownRight}
            accent="purple"
            sensitive={false}
            sub={`${formatNumber(safeMetrics.downsellCount)} venda${safeMetrics.downsellCount === 1 ? "" : "s"} (R$97)`}
          />
          <KpiCard
            label="Aguardando Pagamento"
            value={formatCurrency(safeMetrics.waitingPaymentValue, currency)}
            icon={Clock}
            accent="purple"
            sensitive={false}
            sub={`${formatNumber(safeMetrics.waitingPaymentCount)} venda${safeMetrics.waitingPaymentCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="Abandono de Checkout"
            value={formatCurrency(safeMetrics.abandonedValue, currency)}
            icon={LogOut}
            accent="destructive"
            sensitive={false}
            sub={`${formatNumber(safeMetrics.abandonedCount)} carrinho${safeMetrics.abandonedCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="Recuperação Carrinho Umbler"
            value={formatCurrency(cartRecovery.revenue, currency)}
            icon={RotateCcw}
            accent="emerald"
            sensitive={false}
            sub={`${formatNumber(cartRecovery.count)} venda${cartRecovery.count === 1 ? "" : "s"} recuperada${cartRecovery.count === 1 ? "" : "s"}`}
          />
        </div>
      </div>

      {/* Meta Ads: custo por resultado, além do gasto total já mostrado acima */}
      <div className="space-y-2">
        <span className="micro-label">Meta Ads · Custo & Tráfego</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="CPM"
            value={formatCurrency(cpm, currency)}
            icon={Eye}
            sub="Custo por mil impressões"
          />
          <KpiCard
            label="CTR"
            value={formatPercent(ctr)}
            icon={MousePointerClick}
            sensitive={false}
          />
          <KpiCard
            label="CPC"
            value={formatCurrency(cpc, currency)}
            icon={MousePointer2}
          />
          <KpiCard
            label="CPV"
            value={formatCurrency(cpv, currency)}
            icon={Globe2}
            sub={
              meta.insights.landingPageView > 0
                ? "Custo por visita à landing page (pixel Meta)"
                : "Sem page view reportado pelo pixel da Meta no período"
            }
          />
          <KpiCard
            label="CPI"
            value={formatCurrency(cpi, currency)}
            icon={ListChecks}
            sub={
              meta.insights.initiateCheckout > 0
                ? "Custo por checkout iniciado (pixel Meta)"
                : "Sem checkout iniciado reportado pelo pixel da Meta no período"
            }
          />
          <KpiCard
            label="Compras FB"
            value={formatNumber(meta.insights.metaPurchases)}
            icon={BadgeCheck}
            sensitive={false}
            sub="Conversões reportadas pela própria Meta"
          />
        </div>
      </div>

      {/* Vendas por dia da semana e por horário (fuso de Brasília) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="micro-label">Vendas por Dia da Semana</span>
          </div>
          <WeekdaySalesChart data={timing.weekday} />
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Clock className="size-4 text-muted-foreground" />
            <span className="micro-label">Vendas por Horário</span>
          </div>
          <HourSalesChart data={timing.hour} />
        </Card>
      </div>

      {/* Vendas por produto, forma de pagamento e origem (pago vs orgânico) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Package className="size-4 text-muted-foreground" />
            <span className="micro-label">Vendas por Produto</span>
          </div>
          <ProductBreakdown products={safeMetrics.products} currency={currency} />
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <CreditCard className="size-4 text-muted-foreground" />
            <span className="micro-label">Vendas por Pagamento</span>
          </div>
          <PaymentMethodDonut methods={safeMetrics.paymentMethods} />
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Share2 className="size-4 text-muted-foreground" />
            <span className="micro-label">Vendas por Origem</span>
          </div>
          <OriginDonut origin={safeMetrics.origin} />
        </Card>
      </div>

      {/* Gráfico + feed em tempo real */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Activity className="size-4 text-muted-foreground" />
            <span className="micro-label">
              Faturamento vs Gasto
            </span>
          </div>
          <div className="sensitive">
            <RevenueChart data={daily} currency={currency} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Radio className="size-4 text-muted-foreground" />
            <span className="micro-label">
              Vendas em Tempo Real
            </span>
          </div>
          <RealtimeSales
            areaId={activeArea.id}
            currency={currency}
            initial={safeMetrics.recent}
          />
        </Card>

        <Card className="xl:col-span-3">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Globe2 className="size-4 text-muted-foreground" />
            <span className="micro-label">
              Vendas por Região
            </span>
          </div>
          <RegionBreakdown regions={safeMetrics.regions} currency={currency} />
        </Card>
      </div>
    </div>
  );
}
