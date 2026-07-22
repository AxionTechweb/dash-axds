import { Zap } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Regras" };

export default function RegrasPage() {
  return (
    <PagePlaceholder
      title="Regras"
      description="Automação conservadora de campanhas: só pausar ou notificar."
      phase="Fase 7"
      icon={Zap}
      items={[
        "CRUD: SE {métrica} {>|<} {valor} no período {X} ENTÃO {pausar|notificar}",
        "Usa os mesmos dados já cacheados de Campanhas (sem requisições extras à Meta)",
        "Execução agendada por Vercel Cron, respeitando o rate limit",
        "Histórico completo em rule_executions",
      ]}
    />
  );
}
