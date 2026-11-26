"use client";

import { Check, Loader2, Send } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EMAIL_VARIABLES, renderEmail, SAMPLE_CONTEXT } from "@/lib/email/template";

import { processEmailQueueNow, saveEmailRule, sendTestEmail, type FormState } from "./actions";

export type EmailRuleView = {
  subject: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  fromName: string;
  replyTo: string;
  delayMinutes: number;
  enabled: boolean;
};

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) return <p className="text-xs text-primary">{state.ok}</p>;
  return null;
}

export function EmailRuleForm({
  trigger,
  rule,
  sender,
}: {
  trigger: string;
  rule: EmailRuleView;
  sender: string | null;
}) {
  const [state, saveAction, saving] = useActionState<FormState, FormData>(saveEmailRule, {});
  const [testState, testAction, testing] = useActionState<FormState, FormData>(sendTestEmail, {});

  const [subject, setSubject] = useState(rule.subject);
  const [body, setBody] = useState(rule.body);
  const [buttonLabel, setButtonLabel] = useState(rule.buttonLabel);
  const [buttonUrl, setButtonUrl] = useState(rule.buttonUrl);
  const [fromName, setFromName] = useState(rule.fromName);

  const preview = useMemo(
    () => renderEmail({ subject, body, buttonLabel, buttonUrl }, SAMPLE_CONTEXT),
    [subject, body, buttonLabel, buttonUrl],
  );

  return (
    <form action={saveAction} className="grid grid-cols-1 gap-6 p-5 xl:grid-cols-2">
      <input type="hidden" name="trigger" value={trigger} />

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from_name">Nome do remetente</Label>
            <Input
              id="from_name"
              name="from_name"
              maxLength={60}
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="ex.: Equipe Axion"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reply_to">Responder para (opcional)</Label>
            <Input
              id="reply_to"
              name="reply_to"
              type="email"
              defaultValue={rule.replyTo}
              placeholder="suporte@seudominio.com"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Assunto</Label>
          <Input
            id="subject"
            name="subject"
            maxLength={200}
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Texto</Label>
          <textarea
            id="body"
            name="body"
            rows={9}
            required
            maxLength={10000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="text-xs text-muted-foreground">
            Variáveis:{" "}
            {EMAIL_VARIABLES.map((v, i) => (
              <span key={v.id}>
                <code className="font-mono text-foreground">{`{{${v.id}}}`}</code> {v.label.toLowerCase()}
                {i < EMAIL_VARIABLES.length - 1 ? " · " : ""}
              </span>
            ))}
            . Linha em branco separa parágrafos.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="button_label">Botão (opcional)</Label>
            <Input
              id="button_label"
              name="button_label"
              maxLength={60}
              value={buttonLabel}
              onChange={(e) => setButtonLabel(e.target.value)}
              placeholder="ex.: Acessar o curso"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="button_url">Link do botão</Label>
            <Input
              id="button_url"
              name="button_url"
              maxLength={500}
              value={buttonUrl}
              onChange={(e) => setButtonUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="delay_minutes">Enviar após (minutos)</Label>
            <Input
              id="delay_minutes"
              name="delay_minutes"
              type="number"
              min={0}
              max={10080}
              defaultValue={rule.delayMinutes}
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={rule.enabled}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            E-mail ligado
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar
          </Button>
          <Feedback state={state} />
        </div>

        <div className="space-y-2 rounded-xl border border-border p-4">
          <Label htmlFor="test_to">Enviar teste para</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="test_to" name="test_to" type="email" autoComplete="email" placeholder="seu@email.com" />
            <Button type="submit" formAction={testAction} variant="secondary" size="sm" disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar teste
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Manda o texto acima (mesmo sem salvar) com dados fictícios: Fulano de Tal, Produto de
            teste, R$ 97,00.
          </p>
          <Feedback state={testState} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="micro-label">Prévia</p>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="space-y-1 border-b border-border p-3 text-xs">
            <p>
              <span className="text-muted-foreground">De: </span>
              {fromName ? `${fromName} <${sender ?? "…"}>` : (sender ?? "remetente do servidor")}
            </p>
            <p>
              <span className="text-muted-foreground">Assunto: </span>
              <strong>{preview.subject}</strong>
            </p>
          </div>
          <iframe
            title="Prévia do e-mail"
            srcDoc={preview.html}
            sandbox=""
            className="h-[420px] w-full bg-white"
          />
        </div>
      </div>
    </form>
  );
}

export function ProcessEmailQueueButton({ queued }: { queued: number }) {
  const [state, action, pending] = useActionState<FormState>(processEmailQueueNow, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" size="sm" disabled={pending || queued === 0}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Processar fila ({queued})
      </Button>
      <Feedback state={state} />
    </form>
  );
}
