import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getRoasSegmentsByAd } from "@/lib/attribution";
import { getAccountOptions, getMetaEntities } from "@/lib/meta/campaigns";
import { resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { getVturbByAd } from "@/lib/vturb/metrics";

import { CreativeCards, type CreativeRow } from "./creative-cards";
import { CriativoSearch } from "./criativo-search";

export const metadata: Metadata = { title: "Criativos" };
export const dynamic = "force-dynamic";

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
  account?: string;
  q?: string;
  status?: string;
};

const selectClass =
  "h-9 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-sm";

export default async function CriativosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver os criativos.
        </p>
      </Card>
    );
  }

  const settings = await getSettings(activeArea.id);
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;

  // Mesma tripla já usada em /vturb (Meta nível "ad" + Vturb por ad_id +
  // segmentação de ROAS Front/Backend por ad_id) — todas em paralelo, e o
  // filtro de conta já aplicado direto na busca da Meta.
  const [metaResult, vturbResult, roasByAd, accounts] = await Promise.all([
    getMetaEntities(activeArea.id, "ad", period.from, period.to, params.account),
    getVturbByAd(activeArea.id, period.from, period.to),
    getRoasSegmentsByAd(activeArea.id, period.from, period.to),
    getAccountOptions(activeArea.id),
  ]);

  // Com entrega no período OU ativo na Meta — senão anúncio recém-criado (em
  // revisão, ainda sem impressão) não aparecia. Pausado sem entrega fica fora.
  const activeAds = metaResult.rows.filter(
    (entity) =>
      entity.spend > 0 ||
      entity.impressions > 0 ||
      ["ACTIVE", "PENDING_REVIEW", "IN_PROCESS", "WITH_ISSUES"].includes(
        (entity.effectiveStatus || entity.status).toUpperCase(),
      ),
  );

  // Autocomplete da busca — nomes de TODOS os criativos ativos no período,
  // não só os já filtrados (senão a sugestão só mostraria o que já bateu).
  const creativeOptions = activeAds.map((entity) => ({
    id: entity.id,
    name: entity.name,
  }));

  let rows: CreativeRow[] = activeAds.map((entity) => {
    const vturb = vturbResult.byAd.get(entity.id) ?? null;
    const roas = roasByAd.get(entity.id);

    const frontRevenue = roas?.frontRevenue ?? 0;
    const frontSales = roas?.frontCount ?? 0;
    const backendRevenue =
      (roas?.upsellRevenue ?? 0) + (roas?.downsellRevenue ?? 0) + (roas?.recoveryRevenue ?? 0);
    const backendSales =
      (roas?.upsellCount ?? 0) + (roas?.downsellCount ?? 0) + (roas?.recoveryCount ?? 0);

    const sales = frontSales + backendSales;
    const revenue = frontRevenue + backendRevenue;

    return {
      id: entity.id,
      name: entity.name,
      accountLabel: entity.accountLabel,
      status: entity.effectiveStatus || entity.status,
      thumbnailUrl: entity.thumbnailUrl,
      spend: entity.spend,
      impressions: entity.impressions,
      clicks: entity.clicks,
      cpm: entity.impressions > 0 ? (entity.spend / entity.impressions) * 1000 : 0,
      ctr: entity.impressions > 0 ? (entity.clicks / entity.impressions) * 100 : 0,
      cpc: entity.clicks > 0 ? entity.spend / entity.clicks : 0,
      hookRate: vturb?.funnelHookRate ?? null,
      sales,
      revenue,
      roasFront: entity.spend > 0 ? frontRevenue / entity.spend : 0,
      roasBackend: entity.spend > 0 ? backendRevenue / entity.spend : 0,
    };
  });

  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }
  if (params.status === "active") {
    rows = rows.filter((r) => r.status.toUpperCase() === "ACTIVE");
  } else if (params.status === "paused") {
    // Qualquer coisa fora "ACTIVE" (ex.: PAUSED, CAMPAIGN_PAUSED,
    // ADSET_PAUSED) — mesma regra já usada em /campanhas.
    rows = rows.filter((r) => r.status.toUpperCase() !== "ACTIVE");
  }

  rows.sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Criativos</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {period.label} · {period.from.toLocaleDateString("pt-BR")} –{" "}
          {period.to.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/criativos">
        {params.period ? <input type="hidden" name="period" value={params.period} /> : null}
        {params.from ? <input type="hidden" name="from" value={params.from} /> : null}
        {params.to ? <input type="hidden" name="to" value={params.to} /> : null}
        <CriativoSearch options={creativeOptions} />
        <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className={selectClass}>
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
        </select>
        {accounts.length > 1 ? (
          <select name="account" defaultValue={params.account ?? ""} aria-label="Conta" className={selectClass}>
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Filtrar
        </button>
      </form>

      {!metaResult.configured ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Nenhuma conta de anúncio da Meta conectada nesta área.
        </Card>
      ) : null}

      {[...metaResult.errors, ...vturbResult.errors].length > 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          {[...metaResult.errors, ...vturbResult.errors].join(" · ")}
        </Card>
      ) : null}

      <CreativeCards rows={rows} currency={currency} />
    </div>
  );
}
