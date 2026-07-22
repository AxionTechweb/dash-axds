import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Vendas" };

export default function VendasPage() {
  return (
    <PagePlaceholder
      title="Vendas"
      description="Compras recebidas por webhook e eventos capturados."
      phase="Fase 7"
      icon={ShoppingCart}
      items={[
        "Tabela de compras filtrável por período, status, plataforma e produto",
        "Modal com comprador mascarado, match, ad_id, UTMs e payload bruto",
        "Aba de Eventos com o events_log filtrável",
      ]}
    />
  );
}
