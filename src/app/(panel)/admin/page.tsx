import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/panel/page-placeholder";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <PagePlaceholder
      title="Admin"
      description="Usuários do painel, áreas e log de auditoria."
      phase="Fase 7"
      icon={ShieldCheck}
      items={[
        "Convite de usuários por e-mail (Supabase Admin API); signup público segue OFF",
        "Gestão de áreas",
        "Log de auditoria: escritas na Meta, regras executadas e mudanças de config",
      ]}
    />
  );
}
