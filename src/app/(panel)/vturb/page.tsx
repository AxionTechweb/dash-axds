import {
  Activity,
  BadgeDollarSign,
  Clock,
  Eye,
  ListChecks,
  MousePointerClick,
  Percent,
  Play,
  Radio,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiCard } from "@/components/panel/kpi-card";
import { VturbRetentionChart } from "@/components/panel/vturb-retention-chart";
import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getRoasSegmentsByAd } from "@/lib/attribution";
import { getUsdToBrlRate } from "@/lib/exchange-rate";
import { formatCurrency, formatDuration, formatNumber, formatPercent, formatRoas } from "@/lib/format";
import { getMetaEntities } from "@/lib/meta/campaigns";
import { resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { getVturbPlayers } from "@/lib/vturb/client";
import { getVturbByAd } from "@/lib/vturb/metrics";
import { getPlayerRetentionCurve, getPlayerStats, getPlayerTrafficOrigin } from "@/lib/vturb/stats";

export const metadata: Metadata = { title: "Vturb" };
export const dynamic = "force-dynamic";

export default async function VturbPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; period?: string; from?: string; to?: string }>;
}) {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver os dados do Vturb.
        </p>
      </Card>
    );
  }

  const players = await getVturbPlayers(activeArea.id);

  if (players.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="display-title text-3xl text-foreground md:text-4xl">Vturb</h2>
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhum vídeo monitorado ainda. Conecte a Vturb e selecione os vídeos em{" "}
            <strong>Integrações</strong>.
          </p>
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const selected = players.find((p) => p.playerId === params.player) ?? players[0];
  const period = resolvePeriod(params);

  const [
    { stats, error: statsError },
    { points, funnel, error: curveError },
    { rows: originRows, error: originError },
  ] = await Promise.all([
    getPlayerStats(activeArea.id, selected.playerId, period.from, period.to),
    getPlayerRetentionCurve(activeArea.id, selected.playerId, period.from, period.to),
    getPlayerTrafficOrigin(activeArea.id, selected.playerId, period.from, period.to),
  ]);

  // Funil pedido pelo usuário: Hook Rate relativo às VIEWS (não ao total de
  // sessões), e cada retenção seguinte relativa à contagem do gancho (3s) —
  // não ao total, diferente do `retentionPercent` da curva geral.
  const hookRate =
    funnel && stats && stats.views > 0 ? (funnel.countAt3s / stats.views) * 100 : null;
  const retention25 =
    funnel && funnel.countAt3s > 0 ? (funnel.countAt25 / funnel.countAt3s) * 100 : null;
  const retention50 =
    funnel && funnel.countAt3s > 0 ? (funnel.countAt50 / funnel.countAt3s) * 100 : null;
  const retention75 =
    funnel && funnel.countAt3s > 0 ? (funnel.countAt75 / funnel.countAt3s) * 100 : null;

  // Tabela de desempenho por criativo: junta Meta (nível "ad") + Vturb por
  // ad_id + segmentação de ROAS Front/Backend por ad_id — área inteira, não
  // só o player selecionado nas abas acima.
  const [metaAdsResult, vturbByAdResult, roasByAd] = await Promise.all([
    getMetaEntities(activeArea.id, "ad", period.from, period.to),
    getVturbByAd(activeArea.id, period.from, period.to),
    getRoasSegmentsByAd(activeArea.id, period.from, period.to),
  ]);

  const activeAds = metaAdsResult.rows.filter(
    (entity) => entity.spend > 0 || entity.impressions > 0,
  );

  // Câmbio USD→BRL local a esta tabela (mesma decisão já tomada pro
  // relatório semanal — não mexe na função compartilhada getMetaEntities).
  const hasUsdAds = activeAds.some((e) => e.accountCurrency?.toUpperCase() === "USD");
  const fxRate = hasUsdAds ? await getUsdToBrlRate() : null;
  const creativeTableErrors = [...metaAdsResult.errors, ...vturbByAdResult.errors];
  if (hasUsdAds && !fxRate) {
    creativeTableErrors.push(
      "Câmbio USD→BRL indisponível — gasto em dólar pode estar incorreto na tabela por criativo.",
    );
  }

  const creativeRows = activeAds
    .map((entity) => {
      const isUsd = entity.accountCurrency?.toUpperCase() === "USD";
      const fx = isUsd && fxRate ? fxRate.usdToBrl : 1;
      const spend = entity.spend * fx;

      const vturbRow = vturbByAdResult.byAd.get(entity.id);
      const roas = roasByAd.get(entity.id);
      // Backend = Upsell + Downsell + Recuperação (mesma definição do /dashboard).
      const backendRevenue =
        (roas?.upsellRevenue ?? 0) + (roas?.downsellRevenue ?? 0) + (roas?.recoveryRevenue ?? 0);
      const frontRevenue = roas?.frontRevenue ?? 0;
      const purchases =
        (roas?.frontCount ?? 0) +
        (roas?.upsellCount ?? 0) +
        (roas?.downsellCount ?? 0) +
        (roas?.recoveryCount ?? 0);
      const pageViews = entity.metaLandingPageView;
      const uniqueViews = vturbRow?.uniqueViews ?? 0;

      return {
        adId: entity.id,
        adName: entity.name,
        pageViews,
        // EPC (nome herdado da planilha de referência do usuário, fórmula
        // literal não é "receita/clique" apesar do nome): Page View / Purchase.
        epc: purchases > 0 ? pageViews / purchases : 0,
        // RPV: Receita (front+backend) / Visualizações únicas da Vturb.
        rpv: uniqueViews > 0 ? (frontRevenue + backendRevenue) / uniqueViews : 0,
        accountLabel: entity.accountLabel,
        status: entity.effectiveStatus || entity.status,
        spend,
        impressions: entity.impressions,
        clicks: entity.clicks,
        cpm: entity.impressions > 0 ? (spend / entity.impressions) * 1000 : 0,
        ctr: entity.impressions > 0 ? (entity.clicks / entity.impressions) * 100 : 0,
        cpc: entity.clicks > 0 ? spend / entity.clicks : 0,
        vturb: vturbRow ?? null,
        roasFrontRevenue: frontRevenue,
        roasFront: spend > 0 ? frontRevenue / spend : 0,
        roasBackendRevenue: backendRevenue,
        roasBackend: spend > 0 ? backendRevenue / spend : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const tabParams = new URLSearchParams();
  if (params.period) tabParams.set("period", params.period);
  if (params.from) tabParams.set("from", params.from);
  if (params.to) tabParams.set("to", params.to);
  const tabQuery = tabParams.toString();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="display-title text-3xl text-foreground md:text-4xl">Vturb</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Desempenho do vídeo — período: {period.label}. Dados ao vivo da Vturb.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <Link
            key={player.playerId}
            href={`/vturb?player=${player.playerId}${tabQuery ? `&${tabQuery}` : ""}`}
            className={cn(
              "micro-label rounded-full border px-4 py-2 transition-colors",
              player.playerId === selected.playerId
                ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] text-primary"
                : "border-border text-muted-foreground hover:border-[hsl(var(--foreground)/0.2)]",
            )}
          >
            {player.label}
          </Link>
        ))}
      </div>

      {statsError ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar as métricas: {statsError}
          </p>
        </Card>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Views" value={formatNumber(stats.views)} icon={Eye} sensitive={false} />
          <KpiCard
            label="Unique Views"
            value={formatNumber(stats.uniqueViews)}
            icon={Users}
            sensitive={false}
          />
          <KpiCard
            label="Plays"
            value={formatNumber(stats.plays)}
            icon={Play}
            accent="primary"
            sensitive={false}
          />
          <KpiCard
            label="Unique Plays"
            value={formatNumber(stats.uniquePlays)}
            icon={ListChecks}
            accent="primary"
            sensitive={false}
          />
          <KpiCard
            label="Hook Rate"
            value={hookRate !== null ? formatPercent(hookRate, 2) : "—"}
            icon={Zap}
            accent="purple"
            sensitive={false}
            sub="Reprodução 3s / Views"
          />
          <KpiCard
            label="Retenção 25%"
            value={retention25 !== null ? formatPercent(retention25, 2) : "—"}
            icon={Percent}
            accent="purple"
            sensitive={false}
            sub="Reprodução 25% / Reprodução 3s"
          />
          <KpiCard
            label="Retenção 50%"
            value={retention50 !== null ? formatPercent(retention50, 2) : "—"}
            icon={Percent}
            accent="purple"
            sensitive={false}
            sub="Reprodução 50% / Reprodução 3s"
          />
          <KpiCard
            label="Retenção 75%"
            value={retention75 !== null ? formatPercent(retention75, 2) : "—"}
            icon={Percent}
            accent="purple"
            sensitive={false}
            sub="Reprodução 75% / Reprodução 3s"
          />
          <KpiCard
            label="Tempo médio de visualização"
            value={formatDuration(funnel?.avgWatchSeconds ?? null)}
            icon={Clock}
            sensitive={false}
          />
          <KpiCard
            label="Play Rate"
            value={stats.playRate !== null ? formatPercent(stats.playRate, 2) : "—"}
            icon={Percent}
            accent="purple"
            sensitive={false}
          />
          <KpiCard
            label="Pitch Retention"
            value={stats.pitchRetention !== null ? formatPercent(stats.pitchRetention, 2) : "—"}
            icon={Activity}
            accent="emerald"
            sensitive={false}
          />
          <KpiCard
            label="Pitch Audience"
            value={formatNumber(stats.pitchAudience)}
            icon={Users}
            accent="purple"
            sensitive={false}
          />
          <KpiCard
            label="Engagement"
            value={stats.engagementRate !== null ? formatPercent(stats.engagementRate, 2) : "—"}
            icon={Radio}
            accent="emerald"
            sensitive={false}
          />
          <KpiCard
            label="Button Clicks"
            value={formatNumber(stats.buttonClicks)}
            icon={MousePointerClick}
            accent="primary"
            sensitive={false}
          />
          <KpiCard
            label="Conversions"
            value={formatNumber(stats.conversions)}
            icon={Target}
            accent="emerald"
            sensitive={false}
          />
          <KpiCard
            label="Conversion Rate"
            value={stats.conversionRate !== null ? formatPercent(stats.conversionRate, 2) : "—"}
            icon={TrendingUp}
            accent="emerald"
            sensitive={false}
          />
          <KpiCard
            label="Revenue"
            value={new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(stats.revenue)}
            icon={BadgeDollarSign}
            accent="emerald"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardLabel>General Retention</CardLabel>
        </CardHeader>
        {curveError ? (
          <p className="p-5 text-sm text-muted-foreground">
            Não foi possível carregar a curva de retenção: {curveError}
          </p>
        ) : points.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Sem dados de retenção suficientes ainda.
          </p>
        ) : (
          <VturbRetentionChart data={points} />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardLabel>Origem de tráfego</CardLabel>
        </CardHeader>
        {originError ? (
          <p className="p-5 text-sm text-muted-foreground">
            Não foi possível carregar a origem de tráfego: {originError}
          </p>
        ) : originRows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Sem dados de origem de tráfego no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Origem</Th>
                  <Th align="right">Views</Th>
                  <Th align="right">Views únicas</Th>
                  <Th align="right">Plays</Th>
                  <Th align="right">Play Rate</Th>
                  <Th align="right">Conversões</Th>
                  <Th align="right">Taxa de conversão</Th>
                  <Th align="right">Receita</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {originRows.map((row) => (
                  <tr key={row.source} className="hover:bg-muted/40">
                    <td className="max-w-xs truncate px-4 py-2.5">{row.source}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.views)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.uniqueViews)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.plays)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.playRate !== null ? formatPercent(row.playRate, 2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.conversions)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.conversionRate !== null ? formatPercent(row.conversionRate, 2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardLabel>Desempenho por criativo</CardLabel>
          <span className="micro-label">Meta + Vturb + ROAS — todos os vídeos, área inteira</span>
        </CardHeader>
        {creativeTableErrors.length > 0 ? (
          <p className="border-b border-border p-4 text-sm text-muted-foreground">
            {creativeTableErrors.join(" · ")}
          </p>
        ) : null}
        {creativeRows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Nenhum criativo com gasto ou impressão no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Criativo</Th>
                  <Th>Conta</Th>
                  <Th>Status</Th>
                  <Th align="right">Gasto</Th>
                  <Th align="right">Impressões</Th>
                  <Th align="right">Cliques</Th>
                  <Th align="right">CPM</Th>
                  <Th align="right">CTR</Th>
                  <Th align="right">CPC</Th>
                  <Th align="right">Views</Th>
                  <Th align="right">Unique Views</Th>
                  <Th align="right">Plays</Th>
                  <Th align="right">Unique Plays</Th>
                  <Th align="right">Play Rate</Th>
                  <Th align="right">Engagement</Th>
                  <Th align="right">Pitch Retention</Th>
                  <Th align="right">Pitch Audience</Th>
                  <Th align="right">Button Clicks</Th>
                  <Th align="right">Conversions</Th>
                  <Th align="right">Conversion Rate</Th>
                  <Th align="right">Revenue (Vturb)</Th>
                  <Th align="right">Retenção 1º min</Th>
                  <Th align="right">EPC</Th>
                  <Th align="right">RPV</Th>
                  <Th align="right">ROAS Front</Th>
                  <Th align="right">ROAS Backend</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creativeRows.map((row) => (
                  <tr key={row.adId} className="hover:bg-muted/40">
                    <td className="max-w-xs truncate px-4 py-2.5">{row.adName}</td>
                    <td className="max-w-[10rem] truncate px-4 py-2.5 text-xs text-muted-foreground">
                      {row.accountLabel}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.status}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.spend)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.impressions)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.clicks)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.cpm)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatPercent(row.ctr, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.cpc)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.views ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.uniqueViews ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.rawPlays ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.uniquePlays ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.vturb?.playRate !== null && row.vturb?.playRate !== undefined
                        ? formatPercent(row.vturb.playRate, 2)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.vturb?.engagementRate !== null && row.vturb?.engagementRate !== undefined
                        ? formatPercent(row.vturb.engagementRate, 2)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.vturb?.pitchRetention !== null && row.vturb?.pitchRetention !== undefined
                        ? formatPercent(row.vturb.pitchRetention, 2)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.pitchAudience ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.ctaClicks ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.vturb?.conversions ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.vturb?.conversionRate !== null && row.vturb?.conversionRate !== undefined
                        ? formatPercent(row.vturb.conversionRate, 2)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.vturb?.vturbRevenue ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {row.vturb?.retention60 !== null && row.vturb?.retention60 !== undefined
                        ? formatPercent(row.vturb.retention60, 2)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.epc, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatCurrency(row.rpv)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatRoas(row.roasFront)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatRoas(row.roasBackend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`micro-label px-4 py-3 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
