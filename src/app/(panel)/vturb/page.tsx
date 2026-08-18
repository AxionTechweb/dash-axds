import {
  Activity,
  BadgeDollarSign,
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
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KpiCard } from "@/components/panel/kpi-card";
import { VturbRetentionChart } from "@/components/panel/vturb-retention-chart";
import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatNumber, formatPercent } from "@/lib/format";
import { resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { getVturbPlayers } from "@/lib/vturb/client";
import { getPlayerRetentionCurve, getPlayerStats } from "@/lib/vturb/stats";

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

  const [{ stats, error: statsError }, { points, error: curveError }] = await Promise.all([
    getPlayerStats(activeArea.id, selected.playerId, period.from, period.to),
    getPlayerRetentionCurve(activeArea.id, selected.playerId, period.from, period.to),
  ]);

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
    </div>
  );
}
