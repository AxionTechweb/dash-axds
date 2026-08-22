import { ExternalLink, FolderTree } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SettingsForm } from "@/app/(panel)/integracoes/integration-forms";
import { Card } from "@/components/ui/card";
import { getActiveArea, getAreas } from "@/lib/areas";
import { getBranding } from "@/lib/branding";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getCloudflareStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { AreasManager } from "./areas-manager";
import { BrandingForm } from "./branding-form";
import { ProductTiersManager } from "./product-tiers-manager";

const CLOUDFLARE_STYLE: Record<string, string> = {
  none: "bg-[hsl(var(--primary)/0.15)] text-primary",
  minor: "bg-amber/15 text-amber",
  major: "bg-destructive/15 text-destructive",
  critical: "bg-destructive/20 text-destructive",
};

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const [areas, activeArea, branding, cloudflareStatus] = await Promise.all([
    getAreas(),
    getActiveArea(),
    getBranding(),
    getCloudflareStatus(),
  ]);

  const supabase = await createClient();
  const [{ data: settings }, { data: productRows }, { data: tierRows }] =
    activeArea
      ? await Promise.all([
          supabase
            .from("settings")
            .select(
              "currency, tax_rate, revenue_goal, allowed_origins, gateway_fee_pct, gateway_fee_fixed, break_even_value",
            )
            .eq("area_id", activeArea.id)
            .maybeSingle(),
          supabase
            .from("purchases")
            .select("produto")
            .eq("area_id", activeArea.id)
            .not("produto", "is", null)
            .limit(5_000),
          supabase
            .from("product_tiers")
            .select("produto, tier")
            .eq("area_id", activeArea.id),
        ])
      : [{ data: null }, { data: null }, { data: null }];

  // Produtos distintos vistos nas vendas, cada um com o tier já salvo (ou
  // "outro" por padrão) — fonte da tela de classificação abaixo.
  const tierByProduct = new Map(
    (tierRows ?? []).map((row) => [row.produto as string, row.tier as string]),
  );
  const products = [...new Set((productRows ?? []).map((row) => row.produto as string))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((produto) => ({ produto, tier: tierByProduct.get(produto) ?? "outro" }));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Áreas</h2>
          <p className="text-sm text-muted-foreground">
            Cada área tem suas próprias contas de anúncio, integrações,
            visitantes e vendas. Crie novas áreas pelo seletor no topo da
            sidebar.
          </p>
        </div>

        <Card className="p-4">
          {areas.length > 0 ? (
            <AreasManager areas={areas} activeAreaId={activeArea?.id ?? null} />
          ) : (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <FolderTree className="size-5" />
              Nenhuma área ainda. Use “Nova área” no topo da sidebar.
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Branding</h2>
          <p className="text-sm text-muted-foreground">
            Identidade visual da instância (global, não por área). É o que torna
            este painel white label.
          </p>
        </div>

        <Card>
          <BrandingForm branding={branding} />
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Preferências da área
          </h2>
          <p className="text-sm text-muted-foreground">
            Moeda, imposto e meta de faturamento da área{" "}
            <strong>{activeArea?.nome ?? "ativa"}</strong>. Para conectar a Meta
            e o seu checkout, vá em{" "}
            <Link
              href="/integracoes"
              className="font-medium text-primary hover:underline"
            >
              Integrações
            </Link>
            .
          </p>
        </div>

        <Card>
          {activeArea ? (
            <SettingsForm
              currency={(settings?.currency as string) ?? DEFAULT_SETTINGS.currency}
              taxRate={Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate)}
              revenueGoal={Number(
                settings?.revenue_goal ?? DEFAULT_SETTINGS.revenue_goal,
              )}
              allowedOrigins={(settings?.allowed_origins as string[]) ?? []}
              gatewayFeePct={Number(settings?.gateway_fee_pct ?? 0)}
              gatewayFeeFixed={Number(settings?.gateway_fee_fixed ?? 0)}
              breakEvenValue={Number(settings?.break_even_value ?? 0)}
            />
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Crie uma área para configurar as preferências.
            </p>
          )}
        </Card>
      </div>

      {activeArea && products.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Tiers de produto
            </h2>
            <p className="text-sm text-muted-foreground">
              Classifica cada produto vendido como VD, Upsell ou Downsell — usado
              para quebrar a receita por tier no relatório semanal (Vturb +
              Google Sheets, em Integrações). Produto não classificado fica em
              &quot;Outro&quot; e continua entrando no total, só não some
              separado.
            </p>
          </div>

          <Card className="p-4">
            <ProductTiersManager products={products} />
          </Card>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Status dos serviços</h2>
          <p className="text-sm text-muted-foreground">
            Serviços externos dos quais o painel depende.
          </p>
        </div>

        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Cloudflare</p>
              <p className="text-xs text-muted-foreground">cloudflarestatus.com</p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                cloudflareStatus
                  ? (CLOUDFLARE_STYLE[cloudflareStatus.indicator] ?? "bg-muted text-muted-foreground")
                  : "bg-muted text-muted-foreground",
              )}
            >
              {cloudflareStatus?.description ?? "Indisponível"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Meta</p>
              <p className="text-xs text-muted-foreground">
                Sem API pública — confira direto no site deles.
              </p>
            </div>
            <a
              href="https://metastatus.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-[hsl(var(--primary)/0.4)]"
            >
              Ver status
              <ExternalLink className="size-3" />
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
