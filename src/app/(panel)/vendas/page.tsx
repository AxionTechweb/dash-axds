import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { resolvePeriod } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { SalesTable, type SaleRow } from "./sales-table";

export const metadata: Metadata = { title: "Vendas" };
export const dynamic = "force-dynamic";

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
  tab?: string;
  status?: string;
  plataforma?: string;
  q?: string;
  event?: string;
};

function href(params: SearchParams, patch: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v) search.set(k, String(v));
  }
  return `/vendas?${search.toString()}`;
}

const selectClass =
  "h-9 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-sm";

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);
  const tab = params.tab === "eventos" ? "eventos" : "compras";

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver as vendas.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1 w-fit">
        {[
          { key: "compras", label: "Compras" },
          { key: "eventos", label: "Eventos" },
        ].map((item) => (
          <Link
            key={item.key}
            href={href(params, { tab: item.key })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === item.key
                ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "compras" ? (
        <ComprasTab
          areaId={activeArea.id}
          params={params}
          from={period.from}
          to={period.to}
          supabase={supabase}
        />
      ) : (
        <EventosTab
          areaId={activeArea.id}
          params={params}
          from={period.from}
          to={period.to}
          supabase={supabase}
        />
      )}
    </div>
  );
}

type Supa = Awaited<ReturnType<typeof createClient>>;

async function ComprasTab({
  areaId,
  params,
  from,
  to,
  supabase,
}: {
  areaId: string;
  params: SearchParams;
  from: Date;
  to: Date;
  supabase: Supa;
}) {
  let query = supabase
    .from("purchases")
    .select(
      "id, created_at, transaction_id, produto, email, telefone, valor, moeda, status, plataforma, ad_id, match, user_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, raw_webhook",
    )
    .eq("area_id", areaId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (params.status) query = query.eq("status", params.status);
  if (params.plataforma) query = query.eq("plataforma", params.plataforma);
  if (params.q) query = query.ilike("produto", `%${params.q}%`);

  const { data } = await query;
  const rows = (data ?? []) as SaleRow[];

  return (
    <>
      <form className="flex flex-wrap items-center gap-2" action="/vendas">
        <input type="hidden" name="tab" value="compras" />
        {params.period ? (
          <input type="hidden" name="period" value={params.period} />
        ) : null}

        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar produto..."
          aria-label="Buscar produto"
          className="h-9 min-w-44 flex-1 rounded-md border border-border bg-[hsl(var(--input)/0.35)] px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          aria-label="Status"
          className={selectClass}
        >
          <option value="">Todos os status</option>
          <option value="approved">Aprovada</option>
          <option value="pending">Pendente</option>
          <option value="refunded">Reembolsada</option>
          <option value="chargeback">Chargeback</option>
          <option value="canceled">Cancelada</option>
        </select>
        <select
          name="plataforma"
          defaultValue={params.plataforma ?? ""}
          aria-label="Plataforma"
          className={selectClass}
        >
          <option value="">Todas as plataformas</option>
          <option value="hotmart">Hotmart</option>
          <option value="kiwify">Kiwify</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Filtrar
        </button>
      </form>

      <Card>
        <SalesTable rows={rows} />
      </Card>
      <p className="text-[0.7rem] text-muted-foreground">
        Dados do comprador exibidos mascarados (LGPD). Clique numa linha para
        ver detalhes e o payload bruto.
      </p>
    </>
  );
}

async function EventosTab({
  areaId,
  params,
  from,
  to,
  supabase,
}: {
  areaId: string;
  params: SearchParams;
  from: Date;
  to: Date;
  supabase: Supa;
}) {
  let query = supabase
    .from("events_log")
    .select(
      "id, created_at, user_id, event_name, utm_source, utm_campaign, utm_content, geo_country, geo_region, geo_city",
    )
    .eq("area_id", areaId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (params.event) query = query.eq("event_name", params.event);

  const { data } = await query;
  const rows = data ?? [];

  return (
    <>
      <form className="flex flex-wrap items-center gap-2" action="/vendas">
        <input type="hidden" name="tab" value="eventos" />
        {params.period ? (
          <input type="hidden" name="period" value={params.period} />
        ) : null}
        <select
          name="event"
          defaultValue={params.event ?? ""}
          aria-label="Tipo de evento"
          className={selectClass}
        >
          <option value="">Todos os eventos</option>
          <option value="page_view">page_view</option>
          <option value="initiate_checkout">initiate_checkout</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Filtrar
        </button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum evento no período. Instale o snippet nas landing pages para
            começar a capturar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {[
                    "Data",
                    "Evento",
                    "user_id",
                    "utm_source",
                    "utm_campaign",
                    "utm_content",
                    "Região",
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
                  <tr key={row.id as string} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(row.created_at as string).toLocaleString(
                        "pt-BR",
                        { dateStyle: "short", timeStyle: "short" },
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.event_name as string}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.user_id as string}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {(row.utm_source as string) ?? "—"}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
                      {(row.utm_campaign as string) ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {(row.utm_content as string) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {[row.geo_city, row.geo_region, row.geo_country]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
