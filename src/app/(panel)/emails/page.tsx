import type { Metadata } from "next";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { emailConfigured, senderAddress } from "@/lib/email/send";
import { DEFAULT_APPROVED_TEMPLATE } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";

import { EmailRuleForm, ProcessEmailQueueButton, type EmailRuleView } from "./email-forms";

export const metadata: Metadata = { title: "E-mails" };
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
  test: "Teste",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function EmailsPage() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Crie uma área para configurar e-mails.</p>
      </Card>
    );
  }

  const supabase = await createClient();
  const [ruleRes, logRes, queuedRes] = await Promise.all([
    supabase
      .from("email_rules")
      .select("subject, body, button_label, button_url, from_name, reply_to, delay_minutes, enabled")
      .eq("area_id", activeArea.id)
      .eq("trigger", "approved")
      .maybeSingle(),
    supabase
      .from("email_log")
      .select("id, trigger, email, subject, status, error, created_at, sent_at")
      .eq("area_id", activeArea.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("area_id", activeArea.id)
      .eq("status", "queued"),
  ]);

  const r = ruleRes.data;
  const rule: EmailRuleView = r
    ? {
        subject: r.subject as string,
        body: r.body as string,
        buttonLabel: (r.button_label as string | null) ?? "",
        buttonUrl: (r.button_url as string | null) ?? "",
        fromName: (r.from_name as string | null) ?? "",
        replyTo: (r.reply_to as string | null) ?? "",
        delayMinutes: r.delay_minutes as number,
        enabled: Boolean(r.enabled),
      }
    : {
        subject: DEFAULT_APPROVED_TEMPLATE.subject,
        body: DEFAULT_APPROVED_TEMPLATE.body,
        buttonLabel: "",
        buttonUrl: "",
        fromName: "",
        replyTo: "",
        delayMinutes: 0,
        enabled: false,
      };

  const configured = emailConfigured();
  const sender = senderAddress();
  const log = logRes.data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="display-title text-3xl text-foreground">E-mails</h2>

      {!configured ? (
        <Card className="p-4">
          <p role="alert" className="text-sm text-destructive">
            Envio de e-mail não configurado no servidor (RESEND_API_KEY e EMAIL_FROM).
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardLabel>Compra aprovada</CardLabel>
          <span className="micro-label">{r?.enabled ? "ligado" : "desligado"}</span>
        </CardHeader>
        <p className="px-5 pt-4 text-xs text-muted-foreground">
          Sai para o e-mail do comprador quando o checkout avisa que a compra foi aprovada. Nome,
          e-mail, telefone, produto e valor vêm do webhook. Webhook repetido não manda de novo; se a
          compra for reembolsada antes do envio (com atraso), o e-mail é pulado.
        </p>
        <EmailRuleForm trigger="approved" rule={rule} sender={sender} />
      </Card>

      <Card>
        <CardHeader>
          <CardLabel>Histórico</CardLabel>
          <ProcessEmailQueueButton queued={queuedRes.count ?? 0} />
        </CardHeader>
        {log.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum e-mail ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="micro-label border-b border-border">
                  <th className="px-5 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Para</th>
                  <th className="px-3 py-2 font-medium">Assunto</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {log.map((row) => (
                  <tr key={row.id as string}>
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-muted-foreground">
                      {dateTime.format(new Date((row.sent_at ?? row.created_at) as string))}
                    </td>
                    <td className="px-3 py-2 text-xs">{TRIGGER_LABEL[row.trigger as string] ?? row.trigger}</td>
                    <td className="px-3 py-2 text-xs">{row.email as string}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs">{(row.subject as string | null) ?? "—"}</td>
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
