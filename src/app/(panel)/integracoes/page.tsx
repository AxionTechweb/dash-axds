import { Plug } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Integrações" };

export default function IntegracoesPage() {
  return (
    <PagePlaceholder
      title="Integrações"
      description="Contas de anúncio da Meta, webhooks e domínios do snippet."
      phase="Fase 7"
      icon={Plug}
      items={[
        "Contas Meta por área: adicionar, editar e remover (valores mascarados)",
        "Botão “Testar conexão” validando token e escopos antes de salvar",
        "Tokens de webhook (Hotmart/Kiwify) e origens permitidas para CORS",
        "Checklist visual do que ainda falta conectar",
      ]}
    />
  );
}
