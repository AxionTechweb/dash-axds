import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatCurrency, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "GA4" };
export const dynamic = "force-dynamic";

type LandingPageRow = {
  landing_page: string;
  sessions: number;
  active_users: number;
  new_users: number;
  avg_engagement_seconds: number | null;
  key_events: number;
  total_revenue: number;
  key_event_rate: number | null;
};

type SessionSourceRow = {
  source: string;
  active_users: number;
  sessions: number;
  engaged_sessions: number;
  avg_engagement_seconds: number | null;
  engaged_sessions_per_user: number | null;
  events_per_session: number | null;
  engagement_rate: number | null;
  key_events: number;
  event_count: number;
  total_revenue: number;
};

export default async function Ga4Page() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver os dados do GA4.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();

  // O snapshot mais recente já gravado — a página não chama o GA4 na hora,
  // só lê o que o cron diário já deixou pronto.
  const { data: latest } = await supabase
    .from("ga4_landing_pages")
    .select("day")
    .eq("area_id", activeArea.id)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return (
      <div className="space-y-4">
        <h2 className="display-title text-3xl text-foreground md:text-4xl">GA4</h2>
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado do GA4 ainda. Conecte a propriedade em{" "}
            <strong>Integrações</strong> — o primeiro snapshot aparece aqui depois da
            próxima execução do cron diário.
          </p>
        </Card>
      </div>
    );
  }

  const [{ data: rowsData }, { data: sourceRowsData }] = await Promise.all([
    supabase
      .from("ga4_landing_pages")
      .select(
        "landing_page, sessions, active_users, new_users, avg_engagement_seconds, key_events, total_revenue, key_event_rate",
      )
      .eq("area_id", activeArea.id)
      .eq("day", latest.day),
    supabase
      .from("ga4_session_sources")
      .select(
        "source, active_users, sessions, engaged_sessions, avg_engagement_seconds, engaged_sessions_per_user, events_per_session, engagement_rate, key_events, event_count, total_revenue",
      )
      .eq("area_id", activeArea.id)
      .eq("day", latest.day),
  ]);

  const rows = (rowsData ?? []) as LandingPageRow[];
  const total = rows.find((r) => r.landing_page === "(total)");
  const pages = rows
    .filter((r) => r.landing_page !== "(total)")
    .sort((a, b) => b.sessions - a.sessions);

  const sourceRows = (sourceRowsData ?? []) as SessionSourceRow[];
  const sourceTotal = sourceRows.find((r) => r.source === "(total)");
  const sources = sourceRows
    .filter((r) => r.source !== "(total)")
    .sort((a, b) => b.sessions - a.sessions);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="display-title text-3xl text-foreground md:text-4xl">GA4</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Sessões e engajamento por página de destino, últimos 28 dias — atualizado em{" "}
          {latest.day}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardLabel>Página de destino</CardLabel>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Página de destino</Th>
                <Th align="right">Sessões</Th>
                <Th align="right">Usuários ativos</Th>
                <Th align="right">Novos usuários</Th>
                <Th align="right">Tempo médio de engajamento por sessão</Th>
                <Th align="right">Eventos principais</Th>
                <Th align="right">Receita total</Th>
                <Th align="right">Taxa de eventos principais da sessão</Th>
              </tr>
            </thead>
            <tbody>
              {total ? <Row row={total} highlight label="Total" /> : null}
              {pages.map((row) => (
                <Row key={row.landing_page} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardLabel>Aquisição de tráfego — origem da sessão</CardLabel>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Origem da sessão</Th>
                <Th align="right">Usuários ativos</Th>
                <Th align="right">Sessões</Th>
                <Th align="right">Sessões engajadas</Th>
                <Th align="right">Tempo médio de engajamento por sessão</Th>
                <Th align="right">Sessões engajadas por usuário ativo</Th>
                <Th align="right">Eventos por sessão</Th>
                <Th align="right">Taxa de engajamento</Th>
                <Th align="right">Eventos principais</Th>
                <Th align="right">Contagem de eventos</Th>
                <Th align="right">Receita total</Th>
              </tr>
            </thead>
            <tbody>
              {sourceTotal ? <SourceRow row={sourceTotal} highlight label="Total" /> : null}
              {sources.map((row) => (
                <SourceRow key={row.source} row={row} />
              ))}
            </tbody>
          </table>
        </div>
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

function Row({
  row,
  label,
  highlight = false,
}: {
  row: LandingPageRow;
  label?: string;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`border-b border-border/60 last:border-0 ${highlight ? "bg-[hsl(var(--primary)/0.06)] font-medium" : ""}`}
    >
      <td className="max-w-xs truncate px-4 py-2.5">{label ?? row.landing_page}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.sessions)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.active_users)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.new_users)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatDuration(row.avg_engagement_seconds)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.key_events)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatCurrency(row.total_revenue)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {row.key_event_rate !== null ? formatPercent(row.key_event_rate * 100, 2) : "—"}
      </td>
    </tr>
  );
}

function SourceRow({
  row,
  label,
  highlight = false,
}: {
  row: SessionSourceRow;
  label?: string;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`border-b border-border/60 last:border-0 ${highlight ? "bg-[hsl(var(--primary)/0.06)] font-medium" : ""}`}
    >
      <td className="max-w-xs truncate px-4 py-2.5">{label ?? row.source}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.active_users)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.sessions)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.engaged_sessions)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatDuration(row.avg_engagement_seconds)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {row.engaged_sessions_per_user !== null
          ? formatNumber(row.engaged_sessions_per_user, 2)
          : "—"}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {row.events_per_session !== null ? formatNumber(row.events_per_session, 2) : "—"}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {row.engagement_rate !== null ? formatPercent(row.engagement_rate * 100, 2) : "—"}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.key_events)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatNumber(row.event_count)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular">
        {formatCurrency(row.total_revenue)}
      </td>
    </tr>
  );
}
