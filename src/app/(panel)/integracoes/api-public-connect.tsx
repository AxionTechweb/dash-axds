"use client";

import { BookOpen, Check, KeyRound, Loader2, Send, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import {
  generateApiCredentials,
  revokeApiCredentials,
  saveApiWebhook,
  testApiWebhook,
  type ApiCredentialsState,
  type FormState,
} from "./actions";
import { CopyBox } from "./integration-forms";

type Webhook = {
  url: string | null;
  events: string[];
  enabled: boolean;
  secret: string | null;
  failures: number;
};

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  return state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null;
}

export function ApiPublicConnect({
  apiKey,
  lastUsedAt,
  webhook,
  events,
  baseUrl,
}: {
  apiKey: string | null;
  lastUsedAt: string | null;
  webhook: Webhook | null;
  events: { id: string; label: string }[];
  baseUrl: string;
}) {
  const [generated, generate, generating] = useActionState<ApiCredentialsState>(generateApiCredentials, {});
  const [revoked, revoke, revoking] = useActionState<FormState>(revokeApiCredentials, {});
  const [saved, save, saving] = useActionState<FormState, FormData>(saveApiWebhook, {});
  const [tested, test, testing] = useActionState<FormState>(testApiWebhook, {});

  const hasCredentials = Boolean(apiKey);

  return (
    <div className="space-y-5 border-t border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium tracking-tight">API pública</p>
          <p className="text-xs text-muted-foreground">
            Seu sistema envia templates, dispara campanhas e recebe eventos por webhook, usando este número.
          </p>
        </div>
        <a href="/docs/api" target="_blank" rel="noreferrer">
          <Button type="button" size="sm" variant="outline">
            <BookOpen className="size-3.5" />
            Documentação da API
          </Button>
        </a>
      </div>

      <CopyBox label="URL base" value={`${baseUrl}/api/v1`} />

      {generated.apiSecret ? (
        <div className="space-y-3 rounded-lg border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.06)] p-4">
          <p className="text-xs text-foreground">
            Copie o segredo agora e guarde no seu servidor. <strong>Ele não aparece de novo.</strong>
          </p>
          <CopyBox label="x-api-key" value={generated.apiKey ?? ""} />
          <CopyBox label="x-api-secret" value={generated.apiSecret} />
        </div>
      ) : hasCredentials ? (
        <div className="space-y-1">
          <CopyBox label="x-api-key" value={apiKey ?? ""} />
          <p className="text-xs text-muted-foreground">
            x-api-secret: guardado só como hash ·{" "}
            {lastUsedAt ? `último uso ${new Date(lastUsedAt).toLocaleString("pt-BR")}` : "ainda não usado"}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form
          action={generate}
          onSubmit={(e) => {
            if (hasCredentials && !confirm("Gerar credenciais novas? As atuais param de funcionar na hora.")) e.preventDefault();
          }}
        >
          <Button type="submit" variant={hasCredentials ? "secondary" : "primary"} size="sm" disabled={generating}>
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            {hasCredentials ? "Gerar novas credenciais" : "Gerar credenciais"}
          </Button>
        </form>
        {hasCredentials ? (
          <form
            action={revoke}
            onSubmit={(e) => {
              if (!confirm("Revogar as credenciais? A API para de funcionar e o webhook é apagado.")) e.preventDefault();
            }}
          >
            <Button type="submit" variant="destructive" size="sm" disabled={revoking}>
              {revoking ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Revogar
            </Button>
          </form>
        ) : null}
        <Feedback state={generated.apiSecret ? {} : generated} />
        <Feedback state={revoked} />
      </div>

      {hasCredentials && webhook ? (
        <form action={save} className="space-y-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="webhook_url">URL do webhook</Label>
            <Input
              id="webhook_url"
              name="webhook_url"
              type="url"
              autoComplete="off"
              placeholder="https://seusistema.com/webhooks/whatsapp"
              defaultValue={webhook.url ?? ""}
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="micro-label mb-1">Eventos</legend>
            {events.map((ev) => (
              <label key={ev.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="event"
                  value={ev.id}
                  defaultChecked={webhook.events.includes(ev.id)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="font-mono text-foreground">{ev.id}</span> — {ev.label}
                </span>
              </label>
            ))}
          </fieldset>

          {webhook.secret ? (
            <>
              <CopyBox label="Segredo de assinatura (X-Dash-Signature)" value={webhook.secret} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="rotate_secret" className="accent-[hsl(var(--primary))]" />
                Gerar um segredo novo ao salvar
              </label>
            </>
          ) : null}

          {webhook.url && !webhook.enabled ? (
            <p className="text-xs text-destructive">
              Webhook desligado depois de {webhook.failures} entregas seguidas sem sucesso. Corrija o endpoint e salve para
              religar.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Salvar webhook
            </Button>
            {webhook.url ? (
              <Button type="submit" formAction={test} variant="outline" size="sm" disabled={testing}>
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Enviar teste
              </Button>
            ) : null}
            <Feedback state={saved} />
            <Feedback state={tested} />
          </div>
          <p className="text-xs text-muted-foreground">
            Só https público. Cada entrega é assinada com HMAC-SHA256; sem resposta 2xx, reentregamos em 30s, 2min, 10min e
            1h. Deixe a URL em branco e salve para remover.
          </p>
        </form>
      ) : null}
    </div>
  );
}
