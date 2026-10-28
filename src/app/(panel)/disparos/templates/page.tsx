import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getMetaWaIntegration, listMetaTemplates } from "@/lib/meta-wa/client";

import { TemplatesView } from "./templates-view";

export const metadata: Metadata = { title: "Templates WhatsApp" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const activeArea = await getActiveArea();
  const integration = activeArea ? await getMetaWaIntegration(activeArea.id) : null;

  if (!integration) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Conecte a API oficial do WhatsApp (Meta) em{" "}
          <Link href="/integracoes" className="text-primary underline underline-offset-2">
            Integrações
          </Link>{" "}
          para criar templates.
        </p>
      </Card>
    );
  }

  const { templates, error } = await listMetaTemplates(integration);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/disparos" className="micro-label hover:text-foreground">
          ← Disparos
        </Link>
        <h2 className="display-title mt-2 text-3xl text-foreground">Templates WhatsApp Business API</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Para começar uma conversa (ou disparar em massa) a Meta exige um modelo de mensagem
          aprovado: confirmações, lembretes de pagamento, ofertas e avisos.
        </p>
      </div>

      {error ? (
        <Card className="p-4">
          <p role="alert" className="text-sm text-destructive">
            Não consegui listar os templates na Meta: {error}
          </p>
        </Card>
      ) : null}

      <TemplatesView
        templates={templates.map((t) => ({
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          header: t.header,
          body: t.body,
          footer: t.footer,
          buttons: t.buttons,
          rejectedReason: t.rejectedReason,
        }))}
      />
    </div>
  );
}
