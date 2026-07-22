import { FolderTree } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getActiveArea, getAreas } from "@/lib/areas";
import { getBranding } from "@/lib/branding";

import { AreasManager } from "./areas-manager";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const [areas, activeArea, branding] = await Promise.all([
    getAreas(),
    getActiveArea(),
    getBranding(),
  ]);

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

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Moeda, alíquota de imposto, meta de faturamento e origens permitidas
          (CORS) são configuradas por área em{" "}
          <Link
            href="/integracoes"
            className="font-medium text-primary hover:underline"
          >
            Integrações
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
