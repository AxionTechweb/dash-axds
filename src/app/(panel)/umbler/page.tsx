import {
  Clock,
  MessageCircle,
  MessageSquareText,
  ShoppingBag,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { KpiCard } from "@/components/panel/kpi-card";
import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatCurrency, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { resolvePeriod } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import {
  getChatToSaleConversion,
  getChatVolumeSummary,
  getRatingsSummary,
} from "@/lib/umbler/metrics";

export const metadata: Metadata = { title: "Umbler" };
export const dynamic = "force-dynamic";

const RATING_LABEL: Record<string, string> = {
  Excellent: "Excelente",
  Outstanding: "Excepcional",
  Great: "Ótimo",
  Good: "Bom",
  Satisfied: "Satisfeito",
  Average: "Médio",
  Fair: "Razoável",
  Bad: "Ruim",
  Awful: "Péssimo",
  Disappointing: "Decepcionante",
  NoRating: "Sem nota",
};

export default async function UmblerPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver os dados da Umbler.
        </p>
      </Card>
    );
  }

  const params = await searchParams;
  const period = resolvePeriod(params);

  const [
    { summary: chatSummary, errors: chatErrors },
    { summary: ratings, errors: ratingErrors },
    { summary: conversion, errors: conversionErrors },
  ] = await Promise.all([
    getChatVolumeSummary(activeArea.id, period.from, period.to),
    getRatingsSummary(activeArea.id, period.from, period.to),
    getChatToSaleConversion(activeArea.id, period.from, period.to),
  ]);

  const errors = [...chatErrors, ...ratingErrors, ...conversionErrors];

  if (!chatSummary) {
    return (
      <div className="space-y-4">
        <h2 className="display-title text-3xl text-foreground md:text-4xl">Umbler</h2>
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhuma Umbler Talk conectada ainda. Conecte em{" "}
            <strong>Integrações</strong> pra ver chats, contatos e conversão.
          </p>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: templateRows } = await supabase
    .from("umbler_template_sends")
    .select("day, template_id, template_label, sends")
    .eq("area_id", activeArea.id)
    .gte("day", period.from.toISOString().slice(0, 10))
    .lte("day", period.to.toISOString().slice(0, 10))
    .order("day", { ascending: false })
    .order("sends", { ascending: false });

  const templates = templateRows ?? [];
  const conversionRate =
    chatSummary.uniqueContacts > 0 && conversion
      ? (conversion.matchedSales / chatSummary.uniqueContacts) * 100
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="display-title text-3xl text-foreground md:text-4xl">Umbler</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Chats, contatos e conversão do WhatsApp — período: {period.label}. Dados ao
          vivo da Umbler Talk (templates enviados são atualizados 1x/dia).
        </p>
      </div>

      {errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">{errors.join(" · ")}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Chats"
          value={formatNumber(chatSummary.totalChats)}
          icon={MessageCircle}
          sensitive={false}
        />
        <KpiCard
          label="Abertos"
          value={formatNumber(chatSummary.openChats)}
          icon={MessageSquareText}
          accent="primary"
          sensitive={false}
        />
        <KpiCard
          label="Fechados"
          value={formatNumber(chatSummary.closedChats)}
          icon={MessageSquareText}
          sensitive={false}
        />
        <KpiCard
          label="Aguardando"
          value={formatNumber(chatSummary.waitingChats)}
          icon={Clock}
          accent="purple"
          sensitive={false}
        />
        <KpiCard
          label="Contatos únicos"
          value={formatNumber(chatSummary.uniqueContacts)}
          icon={Users}
          sensitive={false}
        />
        <KpiCard
          label="Tempo médio até 1ª resposta"
          value={
            chatSummary.avgFirstReplySeconds !== null
              ? formatDuration(chatSummary.avgFirstReplySeconds)
              : "—"
          }
          icon={Clock}
        />
        <KpiCard
          label="Chats → venda"
          value={conversionRate !== null ? formatPercent(conversionRate, 1) : "—"}
          icon={ShoppingBag}
          accent="emerald"
          sensitive={false}
          sub={
            conversion
              ? `${formatNumber(conversion.matchedSales)} venda(s) de ${formatNumber(chatSummary.uniqueContacts)} contato(s)`
              : undefined
          }
        />
        <KpiCard
          label="Receita atribuída"
          value={conversion ? formatCurrency(conversion.matchedRevenue) : "—"}
          icon={ShoppingBag}
          accent="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardLabel>Chats por setor</CardLabel>
          </CardHeader>
          <BreakdownList items={chatSummary.bySector} total={chatSummary.totalChats} />
        </Card>

        <Card>
          <CardHeader>
            <CardLabel>Chats por atendente</CardLabel>
          </CardHeader>
          <BreakdownList items={chatSummary.byMember} total={chatSummary.totalChats} />
        </Card>

        <Card>
          <CardHeader>
            <CardLabel>Chats por tag</CardLabel>
          </CardHeader>
          <BreakdownList items={chatSummary.byTag} total={chatSummary.totalChats} />
        </Card>
      </div>

      {ratings && ratings.total > 0 ? (
        <Card>
          <CardHeader>
            <CardLabel>Avaliações (CSAT)</CardLabel>
            <span className="micro-label">{ratings.total} avaliação(ões)</span>
          </CardHeader>
          <div className="flex flex-wrap gap-2 p-5">
            {Object.entries(ratings.byRating)
              .sort((a, b) => b[1] - a[1])
              .map(([rating, count]) => (
                <span
                  key={rating}
                  className="rounded-full bg-[hsl(var(--foreground)/0.05)] px-3 py-1.5 text-sm"
                >
                  {RATING_LABEL[rating] ?? rating}:{" "}
                  <strong className="font-mono tabular">{count}</strong>
                </span>
              ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardLabel>Templates enviados por dia</CardLabel>
          <span className="micro-label">atualizado 1x/dia · dia anterior fechado</span>
        </CardHeader>
        {templates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum envio de template registrado nesse período ainda — o primeiro
            snapshot aparece aqui depois da próxima execução do cron diário.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Dia</Th>
                  <Th>Template</Th>
                  <Th align="right">Envios</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((row) => (
                  <tr key={`${row.day}-${row.template_id}`} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {row.day}
                    </td>
                    <td className="px-4 py-2.5">{row.template_label ?? row.template_id}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular">
                      {formatNumber(row.sends)}
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

function BreakdownList({
  items,
  total,
}: {
  items: { id: string; name: string; count: number }[];
  total: number;
}) {
  if (items.length === 0) {
    return <p className="p-5 text-sm text-muted-foreground">Sem dados no período.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.slice(0, 8).map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">
            {formatNumber(item.count)} ({total > 0 ? formatPercent((item.count / total) * 100, 0) : "0%"})
          </span>
        </li>
      ))}
    </ul>
  );
}
