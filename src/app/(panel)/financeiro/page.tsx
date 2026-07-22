import { Wallet } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Financeiro" };

export default function FinanceiroPage() {
  return (
    <PagePlaceholder
      title="Financeiro"
      description="Receita, impostos, reembolsos e chargebacks."
      phase="Fase 7"
      icon={Wallet}
      items={[
        "Receita bruta e líquida (descontando a alíquota configurada)",
        "Ticket médio, reembolsos e chargebacks em valor e taxa %",
        "Recortes por período, produto e plataforma, com gráficos de evolução",
      ]}
    />
  );
}
