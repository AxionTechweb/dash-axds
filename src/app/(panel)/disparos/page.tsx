import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getMetaWaIntegration, listMetaTemplates } from "@/lib/meta-wa/client";
import { DISPATCH_TRIGGERS } from "@/lib/meta-wa/constants";
import { createClient } from "@/lib/supabase/server";

import {
  CampaignForm,
  OptoutForm,
  ProcessQueueButton,
  RuleForm,
  TestForm,
  type RuleView,
  type TemplateOption,
} from "./dispatch-forms";

export const metadata: Metadata = { title: "Disparos" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  skipped: "Pulado",
};

const TRIGGER_LABEL: Record<string, string> = {
  approved: "Compra aprovada",
  waiting_payment: "Pagamento pendente",
  abandoned: "Checkout abandonado",
  lead: "Lead",
  manual: "Manual",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function DisparosPage() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Crie uma área para configurar disparos.</p>
      </Card>
    );
  }

  const integration = await getMetaWaIntegration(activeArea.id);
  if (!integration) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Conecte a API oficial do WhatsApp (Meta) em{" "}
          <Link href="/integracoes" className="text-primary underline underline-offset-2">
            Integrações
          </Link>{" "}
          para criar regras e campanhas de disparo.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ templates: allTemplates, error: templatesError }, rulesRes, logRes, queuedRes, optoutRes] =
    await Promise.all([
      listMetaTemplates(integration),
      supabase
        .from("wa_dispatch_rules")
        .select("trigger, template_name, template_language, body_params, delay_minutes, enabled")
        .eq("area_id", activeArea.id),
      supabase
        .from("wa_dispatch_log")
        .select("id, trigger, campaign_label, telefone, template_name, status, error, created_at, sent_at")
        .eq("area_id", activeArea.id)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("wa_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("area_id", activeArea.id)
        .eq("status", "queued"),
      supabase.from("wa_optouts").select("telefone").eq("area_id", activeArea.id).order("created_at"),
    ]);

  const approved: TemplateOption[] = allTemplates
    .filter((t) => t.status === "APPROVED")
    .map((t) => ({ name: t.name, language: t.language, body: t.body, paramCount: t.paramCount }));
  const pendingCount = allTemplates.filter((t) => t.status === "PENDING").length;

  const rules = new Map<string, RuleView>(
    (rulesRes.data ?? []).map((r) => [
      r.trigger as string,
      {
        templateName: r.template_name as string,
        templateLanguage: r.template_language as string,
        bodyParams: (r.body_params as string[]) ?? [],
        delayMinutes: r.delay_minutes as number,
        enabled: Boolean(r.enabled),
      },
    ]),
  );

  const log = logRes.data ?? [];
  const queued = queuedRes.count ?? 0;

  return (
    <div className="space-y-6">
      {templatesError ? (
        <Card className="p-4">
          <p role="alert" className="text-sm text-destructive">
            Não consegui listar os templates na Meta: {templatesError}
          </p>
        </Card>
      ) : approved.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Nenhum template aprovado ainda
            {pendingCount > 0 ? ` (${pendingCount} em análise)` : ""}. Crie e envie para aprovação
            no WhatsApp Manager da Meta; quando aprovar, ele aparece aqui.
          </p>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="micro-label">Disparos automáticos</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {DISPATCH_TRIGGERS.map((t) => {
            const rule = rules.get(t.id) ?? null;
            return (
              <Card key={t.id}>
                <CardHeader>
                  <CardLabel>{t.label}</CardLabel>
                  <span className="micro-label">{rule?.enabled ? "ligada" : "desligada"}</span>
                </CardHeader>
                <div className="space-y-3 p-5">
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                  <RuleForm
                    trigger={t.id}
                    templates={approved}
                    rule={rule}
                    defaultDelay={t.defaultDelay}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Atraso 0 envia logo após o evento. Com atraso maior, o envio sai quando o agendador
          chamar <code className="font-mono text-foreground">/api/cron/dispatch</code> (no plano
          Hobby da Vercel é 1x/dia; use um cron externo a cada 5 min). Antes de enviar, o painel
          confere de novo se a pessoa já comprou e pula o disparo se sim.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardLabel>Disparo manual em massa</CardLabel>
            <span className="micro-label">leads · compradores · lista</span>
          </CardHeader>
          <CampaignForm templates={approved} />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardLabel>Enviar teste</CardLabel>
              <span className="micro-label">um número, dados fictícios</span>
            </CardHeader>
            <TestForm templates={approved} />
          </Card>

          <Card>
            <CardHeader>
              <CardLabel>Lista de bloqueio</CardLabel>
              <span className="micro-label">nunca recebem disparo</span>
            </CardHeader>
            <OptoutForm numbers={(optoutRes.data ?? []).map((o) => o.telefone as string)} />
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardLabel>Histórico</CardLabel>
          <ProcessQueueButton queued={queued} />
        </CardHeader>
        {log.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum disparo ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="micro-label border-b border-border">
                  <th className="px-5 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Número</th>
                  <th className="px-3 py-2 font-medium">Template</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {log.map((row) => (
                  <tr key={row.id as string}>
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-muted-foreground">
                      {dateTime.format(new Date((row.sent_at ?? row.created_at) as string))}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {TRIGGER_LABEL[row.trigger as string] ?? row.trigger}
                      {row.campaign_label ? (
                        <span className="text-muted-foreground"> · {row.campaign_label}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.telefone as string}</td>
                    <td className="px-3 py-2 text-xs">{row.template_name as string}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={row.status === "failed" ? "text-destructive" : undefined}>
                        {STATUS_LABEL[row.status as string] ?? row.status}
                      </span>
                      {row.error ? (
                        <span className="block max-w-xs truncate text-muted-foreground" title={row.error as string}>
                          {row.error as string}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
