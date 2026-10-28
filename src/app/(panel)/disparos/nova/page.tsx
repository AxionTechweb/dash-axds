import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getMetaWaIntegration, listMetaTemplates } from "@/lib/meta-wa/client";
import { createClient } from "@/lib/supabase/server";

import { CampaignWizard } from "./campaign-wizard";

export const metadata: Metadata = { title: "Novo envio de campanha" };
export const dynamic = "force-dynamic";
// Primeiro lote da campanha é enviado na própria ação.
export const maxDuration = 60;

export default async function NovaCampanhaPage() {
  const activeArea = await getActiveArea();
  const integration = activeArea ? await getMetaWaIntegration(activeArea.id) : null;

  if (!activeArea || !integration) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Conecte a API oficial do WhatsApp (Meta) em{" "}
          <Link href="/integracoes" className="text-primary underline underline-offset-2">
            Integrações
          </Link>{" "}
          para enviar campanhas.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ templates }, { data: waRow }] = await Promise.all([
    listMetaTemplates(integration),
    supabase
      .from("meta_wa_integrations")
      .select("display_phone")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
  ]);

  const approved = templates
    .filter((t) => t.status === "APPROVED")
    .map((t) => ({
      name: t.name,
      language: t.language,
      header: t.header,
      body: t.body,
      footer: t.footer,
      buttons: t.buttons,
      paramCount: t.paramCount,
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/disparos" className="micro-label hover:text-foreground">
        ← Disparos
      </Link>
      <Card>
        <CardHeader>
          <CardLabel>Novo envio de campanha de marketing</CardLabel>
        </CardHeader>
        <div className="p-5">
          <CampaignWizard
            templates={approved}
            displayPhone={(waRow?.display_phone as string | null) ?? null}
          />
        </div>
      </Card>
    </div>
  );
}
