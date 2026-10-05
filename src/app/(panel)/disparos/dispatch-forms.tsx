"use client";

import { Check, Loader2, Send } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PARAM_OPTIONS } from "@/lib/meta-wa/constants";

import {
  addOptout,
  countAudience,
  createManualCampaign,
  deleteDispatchRule,
  processQueueNow,
  removeOptout,
  saveDispatchRule,
  sendTestDispatch,
  type AudienceState,
  type FormState,
} from "./actions";

export type TemplateOption = {
  name: string;
  language: string;
  body: string;
  paramCount: number;
};

export type RuleView = {
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  delayMinutes: number;
  enabled: boolean;
};

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

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

const templateKey = (t: { name: string; language: string }) => `${t.name}|${t.language}`;

/**
 * Seleção de template + as variáveis {{1}}, {{2}}… do corpo. Compartilhado
 * pelos formulários de regra, teste e campanha.
 */
function TemplatePicker({
  templates,
  initialKey,
  initialParams,
}: {
  templates: TemplateOption[];
  initialKey?: string;
  initialParams?: string[];
}) {
  const [key, setKey] = useState(initialKey ?? "");
  const selected = templates.find((t) => templateKey(t) === key);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Template aprovado</Label>
        <select
          name="template"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className={SELECT_CLASS}
          required
        >
          <option value="">Escolha…</option>
          {templates.map((t) => (
            <option key={templateKey(t)} value={templateKey(t)}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <p className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-xs text-muted-foreground">
          {selected.body || "Template sem corpo de texto."}
        </p>
      ) : null}

      {selected && selected.paramCount > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: selected.paramCount }, (_, index) => (
            <div key={`${key}-${index}`} className="space-y-2">
              <Label>{`Variável {{${index + 1}}}`}</Label>
              <select
                name="param"
                defaultValue={initialParams?.[index] ?? PARAM_OPTIONS[0].id}
                className={SELECT_CLASS}
              >
                {PARAM_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ regra */

export function RuleForm({
  trigger,
  templates,
  rule,
  defaultDelay,
}: {
  trigger: string;
  templates: TemplateOption[];
  rule: RuleView | null;
  defaultDelay: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDispatchRule, {});
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(
    deleteDispatchRule,
    {},
  );

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <input type="hidden" name="trigger" value={trigger} />
        <TemplatePicker
          templates={templates}
          initialKey={rule ? `${rule.templateName}|${rule.templateLanguage}` : undefined}
          initialParams={rule?.bodyParams}
        />

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`delay-${trigger}`}>Enviar após (minutos)</Label>
            <Input
              id={`delay-${trigger}`}
              name="delay_minutes"
              type="number"
              min={0}
              max={10080}
              defaultValue={rule?.delayMinutes ?? defaultDelay}
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={rule?.enabled ?? false}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Regra ligada
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar
          </Button>
          <Feedback state={state} />
        </div>
      </form>

      {rule ? (
        <form action={removeAction} className="flex items-center gap-3">
          <input type="hidden" name="trigger" value={trigger} />
          <Button type="submit" variant="ghost" size="sm" disabled={removing}>
            Remover regra
          </Button>
          <Feedback state={removeState} />
        </form>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ teste */

export function TestForm({ templates }: { templates: TemplateOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendTestDispatch, {});

  return (
    <form action={action} className="space-y-3 p-5">
      <TemplatePicker templates={templates} />
      <div className="space-y-2">
        <Label htmlFor="test-phone">Enviar para</Label>
        <Input
          id="test-phone"
          name="telefone"
          inputMode="tel"
          autoComplete="off"
          placeholder="DDD + número, ex.: 11999998888"
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Usa dados fictícios (Fulano de Tal, Produto de teste, R$ 97,00). Envia uma mensagem
        real, por isso vá para o seu próprio número.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviar teste
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- campanha */

export function CampaignForm({ templates }: { templates: TemplateOption[] }) {
  const [audience, setAudience] = useState("leads");
  const [count, runCount, counting] = useActionState<AudienceState, FormData>(countAudience, {});
  const [state, action, pending] = useActionState<FormState, FormData>(createManualCampaign, {});

  // A prévia vale só para o público escolhido: trocar de público a invalida.
  const total = count.total;

  return (
    <form action={action} className="space-y-3 p-5">
      <div className="space-y-2">
        <Label htmlFor="campaign-label">Nome da campanha</Label>
        <Input id="campaign-label" name="label" maxLength={80} placeholder="ex.: reengajamento outubro" />
      </div>

      <TemplatePicker templates={templates} />

      <div className="space-y-2">
        <Label htmlFor="audience">Público</Label>
        <select
          id="audience"
          name="audience"
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="leads">Leads com telefone que não compraram</option>
          <option value="buyers">Compradores (compra aprovada)</option>
          <option value="paste">Lista colada</option>
        </select>
      </div>

      {audience === "paste" ? (
        <div className="space-y-2">
          <Label htmlFor="campaign-numbers">Números (um por linha)</Label>
          <textarea
            id="campaign-numbers"
            name="numbers"
            rows={4}
            className="w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      ) : null}

      <input type="hidden" name="confirm_total" value={total ?? ""} />

      <p className="text-xs text-muted-foreground">
        Só envie para quem aceitou receber mensagens (opt-in) — a Meta restringe a conta por
        denúncias. Números da lista de bloqueio são removidos automaticamente. Limite de 500
        contatos por campanha.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" formAction={runCount} disabled={counting}>
          {counting ? <Loader2 className="size-4 animate-spin" /> : null}
          Ver prévia do público
        </Button>
        {total !== undefined ? (
          <span className="text-sm">
            <strong>{total}</strong> contato(s)
          </span>
        ) : null}
        {count.error ? (
          <p role="alert" className="text-xs text-destructive">
            {count.error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !total}
          onClick={(event) => {
            if (!window.confirm(`Enviar para ${total} contato(s) agora? Esta ação envia mensagens reais.`)) {
              event.preventDefault();
            }
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {total ? `Enviar para ${total}` : "Enviar"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- fila */

export function ProcessQueueButton({ queued }: { queued: number }) {
  const [state, action, pending] = useActionState<FormState>(processQueueNow, {});

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

/* --------------------------------------------------------------- bloqueio */

export function OptoutForm({ numbers }: { numbers: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addOptout, {});
  const [removeState, removeAction] = useActionState<FormState, FormData>(removeOptout, {});

  return (
    <div className="space-y-3 p-5">
      <form action={action} className="space-y-2">
        <Label htmlFor="optout-numbers">Bloquear números (um por linha)</Label>
        <textarea
          id="optout-numbers"
          name="numbers"
          rows={3}
          className="w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            Bloquear
          </Button>
          <Feedback state={state} />
        </div>
      </form>

      {numbers.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {numbers.map((telefone) => (
            <li key={telefone} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-mono text-xs">{telefone}</span>
              <form action={removeAction}>
                <input type="hidden" name="telefone" value={telefone} />
                <Button type="submit" variant="ghost" size="sm">
                  Liberar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <Feedback state={removeState} />
    </div>
  );
}
