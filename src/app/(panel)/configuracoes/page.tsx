import { FolderTree, Settings } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";
import { Card } from "@/components/ui/card";
import { getActiveArea, getAreas } from "@/lib/areas";

import { AreasManager } from "./areas-manager";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const [areas, activeArea] = await Promise.all([getAreas(), getActiveArea()]);

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

      <PagePlaceholder
        title="Preferências da área"
        description="Moeda, alíquota de imposto, meta de faturamento e origens permitidas."
        phase="Fase 7"
        icon={Settings}
        items={[
          "Moeda e alíquota de imposto (usada no cálculo do lucro)",
          "Meta de faturamento exibida na barra de progresso do header",
          "Origens permitidas (CORS) para o snippet das landing pages",
        ]}
      />
    </div>
  );
}
