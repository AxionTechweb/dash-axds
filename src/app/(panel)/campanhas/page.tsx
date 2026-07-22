import { Megaphone } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Campanhas" };

export default function CampanhasPage() {
  return (
    <PagePlaceholder
      title="Campanhas"
      description="Leitura da Meta Ads e edição inline de status e orçamento."
      phase="Fase 6"
      icon={Megaphone}
      items={[
        "Tabs Campanhas / Conjuntos / Anúncios com as mesmas colunas agregadas",
        "Toggle de atribuição: Last Click × Vendas na Meta (nunca somados)",
        "Edição inline de status e orçamento, com confirmação e log de auditoria",
        "Top 5 Anúncios e Funil de Conversão híbrido",
      ]}
    />
  );
}
