import { formatCurrency } from "@/lib/format";
import type { VisitorEvent, VisitorPurchase } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * Peças visuais compartilhadas entre a aba "Eventos" (jornada por visitante)
 * e o detalhe de uma venda na aba "Compras" ("Mapa dos Eventos") — mesmo
 * visual, duas entradas diferentes (por SRC ou a partir de uma compra).
 */

export const STATUS_STYLE: Record<string, string> = {
  approved: "bg-[hsl(var(--primary)/0.15)] text-primary",
  pending: "bg-amber/15 text-amber",
  refunded: "bg-muted text-muted-foreground",
  chargeback: "bg-destructive/15 text-destructive",
  canceled: "bg-muted text-muted-foreground",
};

export const STATUS_LABEL: Record<string, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  canceled: "Cancelada",
};

/** Cores por nome de evento — os automáticos do snippet têm cor fixa; eventos customizados (ex.: lead) caem num tom neutro. */
const EVENT_STYLE: Record<string, string> = {
  page_view: "bg-[hsl(var(--primary)/0.15)] text-primary",
  view_content: "bg-[hsl(var(--accent-emerald)/0.15)] text-emerald",
  lead: "bg-[hsl(var(--accent-purple)/0.15)] text-purple",
  initiate_checkout: "bg-amber/15 text-amber",
  purchase: "bg-[hsl(var(--accent-emerald)/0.2)] text-emerald",
};
const EVENT_STYLE_DEFAULT = "bg-muted text-muted-foreground";

export function EventBadge({ name, label }: { name: string; label?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[0.65rem] font-medium",
        EVENT_STYLE[name] ?? EVENT_STYLE_DEFAULT,
      )}
    >
      {label ?? name}
    </span>
  );
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Caminho + query da URL, sem o domínio — o que importa pra saber em qual etapa do funil o evento aconteceu. */
export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** Um nó da linha do tempo — evento rastreado OU uma compra, misturados por data. */
export type TimelineEntry = {
  eventName: string;
  createdAt: string;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  pageUrl: string | null;
  purchase: VisitorPurchase | null;
};

/** Funde eventos rastreados com compras (viram um nó "purchase") numa única linha do tempo cronológica. */
export function buildTimeline(events: VisitorEvent[], purchases: VisitorPurchase[]): TimelineEntry[] {
  const entries: TimelineEntry[] = events.map((e) => ({
    eventName: e.eventName,
    createdAt: e.createdAt,
    utmSource: e.utmSource,
    utmCampaign: e.utmCampaign,
    utmContent: e.utmContent,
    geoCity: e.geoCity,
    geoRegion: e.geoRegion,
    geoCountry: e.geoCountry,
    pageUrl: e.pageUrl,
    purchase: null,
  }));

  for (const p of purchases) {
    entries.push({
      eventName: "purchase",
      createdAt: p.createdAt,
      utmSource: null,
      utmCampaign: null,
      utmContent: null,
      geoCity: null,
      geoRegion: null,
      geoCountry: null,
      pageUrl: null,
      purchase: p,
    });
  }

  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function ProductsList({ purchases }: { purchases: VisitorPurchase[] }) {
  if (purchases.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        Produtos comprados ({purchases.length})
      </p>
      <div className="space-y-2">
        {purchases.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.produto ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                  STATUS_STYLE[p.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              <span className="font-mono text-sm tabular">
                {formatCurrency(p.valor ?? 0, p.moeda ?? "BRL")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventsTimeline({
  entries,
  title = "Histórico de eventos",
}: {
  entries: TimelineEntry[];
  title?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum evento rastreado. Sem captura própria (GTM/snippet) instalada, ou o
        visitante não foi identificado nessa compra.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({entries.length})
      </p>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <EventBadge name={e.eventName} />
              <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
            </div>

            {e.purchase ? (
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="truncate text-xs text-muted-foreground">{e.purchase.produto ?? "—"}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium",
                      STATUS_STYLE[e.purchase.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {STATUS_LABEL[e.purchase.status] ?? e.purchase.status}
                  </span>
                  <span className="font-mono text-xs tabular">
                    {formatCurrency(e.purchase.valor ?? 0, e.purchase.moeda ?? "BRL")}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  origem: {e.utmSource ?? "—"}
                  {e.utmCampaign ? ` · camp: ${e.utmCampaign}` : ""}
                  {e.utmContent ? ` · anúncio: ${e.utmContent}` : ""}
                </p>
                {e.pageUrl ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={e.pageUrl}>
                    {shortPath(e.pageUrl)}
                  </p>
                ) : null}
                {e.geoCity || e.geoRegion ? (
                  <p className="text-xs text-muted-foreground">
                    {[e.geoCity, e.geoRegion, e.geoCountry].filter(Boolean).join(", ")}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
