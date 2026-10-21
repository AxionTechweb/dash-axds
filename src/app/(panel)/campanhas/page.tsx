import { Info, TriangleAlert, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getLastClickByAd, getWeeklySalesByAdAndTier } from "@/lib/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  getAccountOptions,
  getMetaEntities,
  type CampaignsResult,
  type MetaEntity,
  type MetaLevel,
} from "@/lib/meta/campaigns";
import { resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { CampaignFilters } from "./campaign-filters";
import { CampaignsTable, type TableRow } from "./campaigns-table";

export const metadata: Metadata = { title: "Campanhas" };

const LEVELS: { key: MetaLevel; label: string }[] = [
  { key: "campaign", label: "Campanhas" },
  { key: "adset", label: "Conjuntos" },
  { key: "ad", label: "Anúncios" },
];

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
  level?: string;
  attr?: string;
  account?: string;
  q?: string;
  status?: string;
  /** ID da campanha em modo drill-down (ver CampaignFilters) — quando presente, substitui as abas de nível pela visão campanha + conjuntos + anúncios dela. */
  campaign?: string;
};

function buildHref(params: SearchParams, patch: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v) search.set(k, String(v));
  }
  return `/campanhas?${search.toString()}`;
}

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);

  const level = (LEVELS.find((l) => l.key === params.level)?.key ??
    "campaign") as MetaLevel;
  const attribution = params.attr === "meta" ? "meta" : "lastclick";

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver as campanhas.
        </p>
      </Card>
    );
  }

  const settings = await getSettings(activeArea.id);
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const taxRate = Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate);

  const drillDownCampaignId = params.campaign || null;
  // Conjuntos só são buscados quando viram a tabela principal OU quando o
  // drill-down precisa deles — nos outros casos, nem chama a Meta à toa.
  const needsAdsetLevel = level === "adset" || Boolean(drillDownCampaignId);

  // Cada nível (campanha/conjunto/anúncio) é buscado NO MÁXIMO 1 vez por
  // carga — antes, pedir a tabela em "Campanhas" buscava o nível campanha
  // DUAS vezes (uma pra tabela, outra pro autocomplete) e o nível "ad" já
  // vinha de qualquer forma pro card de Upsell, gerando chamadas repetidas
  // à Meta (a parte mais lenta da página) sem necessidade.
  const [lastClick, accounts, tierByAd, campaignLevelMeta, adLevelMeta, adsetLevelMeta] =
    await Promise.all([
      getLastClickByAd(activeArea.id, period.from, period.to),
      getAccountOptions(activeArea.id),
      getWeeklySalesByAdAndTier(activeArea.id, period.from, period.to),
      // Sempre buscado: alimenta o autocomplete de campanhas no filtro de
      // busca, e é a própria tabela quando level==="campaign".
      getMetaEntities(activeArea.id, "campaign", period.from, period.to, params.account),
      // Sempre buscado: `campaignName`/`campaignId` só vêm preenchidos nesse
      // nível — é o jeito de saber de qual campanha cada ad_id é, pro card
      // de Upsell por campanha e pro drill-down. Também é a própria tabela
      // quando level==="ad".
      getMetaEntities(activeArea.id, "ad", period.from, period.to, params.account),
      needsAdsetLevel
        ? getMetaEntities(activeArea.id, "adset", period.from, period.to, params.account)
        : Promise.resolve<CampaignsResult>({ rows: [], configured: true, errors: [] }),
    ]);

  const meta: CampaignsResult =
    level === "campaign" ? campaignLevelMeta : level === "ad" ? adLevelMeta : adsetLevelMeta;

  // Monta as linhas conforme o MODO DE ATRIBUIÇÃO (nunca somando os dois) —
  // reaproveitada tanto pra tabela normal quanto pro drill-down por campanha.
  function buildRow(entity: MetaEntity): TableRow {
    const own = entity.adIds.reduce(
      (acc, adId) => {
        const row = lastClick.get(adId);
        if (row) {
          acc.sales += row.sales;
          acc.revenue += row.revenue;
        }
        return acc;
      },
      { sales: 0, revenue: 0 },
    );

    // Vendas por tier (VD/front x Upsell) e reembolsos — sempre por ad_id
    // DIRETO (não é Last Click nem atribuição da Meta, é o mesmo cálculo já
    // usado no card "Top Campanhas por Upsell" acima e no relatório
    // semanal), então não muda com o toggle de atribuição.
    const tierTotals = entity.adIds.reduce(
      (acc, adId) => {
        const row = tierByAd.get(adId);
        if (row) {
          acc.vdSales += row.byTier.vd.sales;
          acc.vdRevenue += row.byTier.vd.revenue;
          acc.upsellSales += row.byTier.upsell.sales;
          acc.upsellRevenue += row.byTier.upsell.revenue;
          acc.refunds += row.refundValue + row.chargebackValue;
        }
        return acc;
      },
      { vdSales: 0, vdRevenue: 0, upsellSales: 0, upsellRevenue: 0, refunds: 0 },
    );

    const sales =
      attribution === "meta" ? entity.metaPurchases : own.sales;
    const revenue =
      attribution === "meta" ? entity.metaRevenue : own.revenue;

    const tax = revenue * (taxRate / 100);
    const profit = revenue - entity.spend - tax;

    return {
      id: entity.id,
      name: entity.name,
      level: entity.level,
      status: entity.status,
      effectiveStatus: entity.effectiveStatus,
      budgetAmount: entity.budgetAmount,
      budgetType: entity.budgetType,
      accountId: entity.accountId,
      accountLabel: entity.accountLabel,
      spend: entity.spend,
      impressions: entity.impressions,
      clicks: entity.clicks,
      sales,
      revenue,
      // Checkouts e views vêm do pixel/CAPI da própria Meta — funciona sem
      // o snippet de captura própria (que é opcional).
      checkouts: entity.metaInitiateCheckout,
      views: entity.metaLandingPageView,
      profit,
      roas: entity.spend > 0 ? revenue / entity.spend : 0,
      cpa: sales > 0 ? entity.spend / sales : 0,
      cpm:
        entity.impressions > 0
          ? (entity.spend / entity.impressions) * 1000
          : 0,
      ctr:
        entity.impressions > 0 ? (entity.clicks / entity.impressions) * 100 : 0,
      cpc: entity.clicks > 0 ? entity.spend / entity.clicks : 0,
      ...tierTotals,
    };
  }

  function applyStatusFilter(list: TableRow[]): TableRow[] {
    if (params.status === "active") {
      return list.filter((r) => r.status.toUpperCase() === "ACTIVE");
    }
    if (params.status === "paused") {
      return list.filter((r) => r.status.toUpperCase() !== "ACTIVE");
    }
    return list;
  }

  let rows: TableRow[] = meta.rows.map(buildRow);

  // Filtros de busca e status (aplicados no servidor).
  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }
  rows = applyStatusFilter(rows);

  // Autocomplete do filtro "Buscar por nome" — nomes reais de campanha.
  const campaignOptions = campaignLevelMeta.rows.map((entity) => ({
    id: entity.id,
    name: entity.name,
  }));

  // Modo drill-down: campanha selecionada + SÓ os conjuntos e anúncios dela
  // (nunca os de outras campanhas), filtrados pelo `campaignId` que agora
  // vem de graça em todo insight bruto (ver MetaEntity.campaignId).
  const drillDown = drillDownCampaignId
    ? {
        campaignRow: (() => {
          const entity = campaignLevelMeta.rows.find(
            (e) => e.id === drillDownCampaignId,
          );
          return entity ? buildRow(entity) : null;
        })(),
        adsetRows: applyStatusFilter(
          adsetLevelMeta.rows
            .filter((e) => e.campaignId === drillDownCampaignId)
            .map(buildRow),
        ),
        adRows: applyStatusFilter(
          adLevelMeta.rows
            .filter((e) => e.campaignId === drillDownCampaignId)
            .map(buildRow),
        ),
      }
    : null;

  // Top 5 anúncios por faturamento Last Click (independe do modo da tabela).
  const topAds = [...lastClick.entries()]
    .map(([adId, row]) => ({ adId, ...row }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // adLevelMeta (não `meta`) porque `meta` só tem linhas de nível "ad"
  // quando a aba selecionada é "Anúncios" — sem isso, o card "Top 5
  // Anúncios" ficava sem nome (só o ad_id) nas outras abas.
  const adNames = new Map(
    adLevelMeta.rows.map((r) => [r.id, r.name] as const),
  );

  // Top campanhas por vendas de Upsell — soma o tier "upsell" (já quebrado
  // por ad_id em getWeeklySalesByAdAndTier, mesma função do relatório
  // semanal) agrupando pelo nome da campanha de cada anúncio.
  const upsellByCampaign = new Map<string, { sales: number; revenue: number }>();
  for (const entity of adLevelMeta.rows) {
    const tierRow = tierByAd.get(entity.id);
    const upsell = tierRow?.byTier.upsell;
    if (!upsell || upsell.sales === 0) continue;
    const campaignName = entity.campaignName ?? "Sem campanha";
    const acc = upsellByCampaign.get(campaignName) ?? { sales: 0, revenue: 0 };
    acc.sales += upsell.sales;
    acc.revenue += upsell.revenue;
    upsellByCampaign.set(campaignName, acc);
  }
  const topUpsellCampaigns = [...upsellByCampaign.entries()]
    .map(([campaignName, row]) => ({ campaignName, ...row }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  // Totais do funil — TODOS derivados do MESMO conjunto já filtrado. Antes os
  // cliques vinham de `meta.rows` (sem filtro) e as vendas de `rows` (filtrado),
  // então filtrar por "ativas" reduzia as vendas sem reduzir os cliques e a taxa
  // de conversão saía errada.
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalSales = rows.reduce((sum, r) => sum + r.sales, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalViews = rows.reduce((sum, r) => sum + r.views, 0);
  const totalCheckouts = rows.reduce((sum, r) => sum + r.checkouts, 0);

  // Views e checkouts vêm do pixel/CAPI da própria Meta — ficam em zero
  // quando o pixel não reporta essas ações (não significa captura quebrada).
  // O snippet de captura própria (events_log/getFunnelBase) segue disponível
  // como fonte alternativa, mas não é mais o que preenche este funil.
  const hasOwnEvents = totalViews > 0 || totalCheckouts > 0;

  return (
    <div className="space-y-4">
      {/* Tabs de nível + toggle de atribuição */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {drillDownCampaignId ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Campanha:</span>
            <span className="font-medium">
              {drillDown?.campaignRow?.name ?? drillDownCampaignId}
            </span>
            <Link
              href={buildHref(params, { campaign: "", q: "" })}
              className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Limpar
            </Link>
          </div>
        ) : (
          <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1">
            {LEVELS.map((item) => (
              <Link
                key={item.key}
                href={buildHref(params, { level: item.key })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  level === item.key
                    ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Link
            href="/campanhas/nova"
            className="inline-flex h-8 items-center rounded-full bg-gradient-to-b from-[hsl(var(--gold-light))] to-[hsl(var(--gold))] px-3.5 text-xs font-semibold text-black hover:brightness-110"
          >
            Nova campanha
          </Link>
          <div
            className="group relative"
            title="Last Click: vendas dos seus webhooks casadas por ad_id. Vendas na Meta: o que o gerenciador reporta pelo modelo de atribuição dele. Os dois NUNCA são somados."
          >
            <Info className="size-4 text-muted-foreground" />
          </div>
          <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1">
            <Link
              href={buildHref(params, { attr: "lastclick" })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                attribution === "lastclick"
                  ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Atribuição Last Click
            </Link>
            <Link
              href={buildHref(params, { attr: "meta" })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                attribution === "meta"
                  ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Vendas na Meta
            </Link>
          </nav>
        </div>
      </div>

      <CampaignFilters accounts={accounts} campaignOptions={campaignOptions} />

      {!meta.configured ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhuma conta de anúncio da Meta conectada nesta área. Conecte em{" "}
            <strong>Integrações</strong> para ver campanhas.
          </p>
        </Card>
      ) : null}

      {meta.errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Falha ao ler a Meta</p>
            <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
              {meta.errors.map((err) => (
                <li key={err} className="truncate">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {drillDown ? (
        <div className="space-y-4">
          <Card>
            <div className="border-b border-border p-4">
              <span className="micro-label">Campanha</span>
            </div>
            <CampaignsTable
              rows={drillDown.campaignRow ? [drillDown.campaignRow] : []}
              currency={currency}
              canEdit={meta.configured}
            />
          </Card>

          <Card>
            <div className="border-b border-border p-4">
              <span className="micro-label">
                Conjuntos desta campanha ({drillDown.adsetRows.length})
              </span>
            </div>
            <CampaignsTable
              rows={drillDown.adsetRows}
              currency={currency}
              canEdit={meta.configured}
            />
          </Card>

          <Card>
            <div className="border-b border-border p-4">
              <span className="micro-label">
                Anúncios desta campanha ({drillDown.adRows.length})
              </span>
            </div>
            <CampaignsTable
              rows={drillDown.adRows}
              currency={currency}
              canEdit={meta.configured}
            />
          </Card>
        </div>
      ) : (
        <Card>
          <CampaignsTable
            rows={rows}
            currency={currency}
            canEdit={meta.configured}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <div className="border-b border-border p-4">
            <span className="micro-label">
              Top 5 Anúncios (Last Click)
            </span>
          </div>
          {topAds.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sem vendas atribuídas a anúncios no período.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topAds.map((ad) => (
                <li
                  key={ad.adId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {adNames.get(ad.adId) ?? `Anúncio ${ad.adId}`}
                    </p>
                    <p className="font-mono text-[0.65rem] text-muted-foreground">
                      {ad.adId} · {formatNumber(ad.sales)} vendas
                    </p>
                  </div>
                  <span className="sensitive shrink-0 font-mono text-sm font-semibold text-primary tabular">
                    {formatCurrency(ad.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-border p-4">
            <span className="micro-label">Top 5 Campanhas por Upsell</span>
          </div>
          {topUpsellCampaigns.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sem vendas de upsell atribuídas a campanhas no período.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topUpsellCampaigns.map((c) => (
                <li
                  key={c.campaignName}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.campaignName}</p>
                    <p className="font-mono text-[0.65rem] text-muted-foreground">
                      {formatNumber(c.sales)} vendas de upsell
                    </p>
                  </div>
                  <span className="sensitive shrink-0 font-mono text-sm font-semibold text-primary tabular">
                    {formatCurrency(c.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-border p-4">
            <span className="micro-label">
              Funil de Vendas
            </span>
          </div>

          {totalImpressions === 0 && totalClicks === 0 && totalSales === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sem veiculação nem vendas no período selecionado.
            </p>
          ) : (
            <>
              <FunnelStep
                label="Impressões"
                value={totalImpressions}
                previous={null}
                base={totalImpressions}
              />
              <FunnelStep
                label="Cliques"
                value={totalClicks}
                previous={totalImpressions}
                base={totalImpressions}
              />
              {hasOwnEvents ? (
                <>
                  <FunnelStep
                    label="Views (page_view)"
                    value={totalViews}
                    previous={totalClicks}
                    base={totalImpressions}
                  />
                  <FunnelStep
                    label="Checkouts iniciados"
                    value={totalCheckouts}
                    previous={totalViews}
                    base={totalImpressions}
                  />
                </>
              ) : null}
              <FunnelStep
                label={
                  attribution === "meta"
                    ? "Vendas (relatadas pela Meta)"
                    : "Vendas aprovadas (Last Click)"
                }
                value={totalSales}
                previous={hasOwnEvents ? totalCheckouts : totalClicks}
                base={totalImpressions}
              />

              <div className="space-y-1.5 px-4 py-3 text-xs text-muted-foreground">
                <p>
                  Taxa clique → venda:{" "}
                  <span className="font-mono tabular text-foreground">
                    {totalClicks > 0
                      ? formatPercent((totalSales / totalClicks) * 100, 2)
                      : "—"}
                  </span>
                </p>
                <p>
                  Faturamento atribuído:{" "}
                  <span className="sensitive font-mono tabular text-foreground">
                    {formatCurrency(totalRevenue, currency)}
                  </span>
                  {totalSales > 0 ? (
                    <>
                      {" · ticket médio "}
                      <span className="sensitive font-mono tabular text-foreground">
                        {formatCurrency(totalRevenue / totalSales, currency)}
                      </span>
                    </>
                  ) : null}
                </p>
                {!hasOwnEvents ? (
                  <p className="pt-1">
                    Views e checkouts iniciados vêm do pixel/CAPI da própria
                    Meta — zerados aqui significa que o pixel não está
                    reportando essas ações no período, não que a captura está
                    quebrada. A atribuição por anúncio não depende disso.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Uma etapa do funil.
 *
 * `previous` alimenta o PERCENTUAL (conversão em relação à etapa anterior).
 * `base` alimenta a LARGURA da barra (proporção sobre o topo do funil) — sem
 * isso, uma etapa que converte 100% da anterior desenhava barra cheia e o
 * gráfico não afunilava, que era o oposto do que um funil deve mostrar.
 */
function FunnelStep({
  label,
  value,
  previous,
  base,
}: {
  label: string;
  value: number;
  previous: number | null;
  base: number;
}) {
  const rate = previous && previous > 0 ? (value / previous) * 100 : null;

  const raw = base > 0 ? (value / base) * 100 : value > 0 ? 100 : 0;
  // Piso visual: uma etapa com valor > 0 nunca some da tela (uma venda sobre
  // milhares de impressões daria uma barra de largura zero).
  const width = value > 0 ? Math.min(Math.max(raw, 1.5), 100) : 0;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-mono tabular">
          {formatNumber(value)}
          {rate !== null ? (
            <span className="ml-2 text-xs text-muted-foreground">
              {formatPercent(rate, 1)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="fill-neon h-full rounded-full" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
