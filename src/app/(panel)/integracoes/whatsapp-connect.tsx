"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveWhatsappIntegration, type FormState } from "./actions";

export function WhatsappConnect({
  connected,
  baseUrl,
  instance,
  targetNumber,
}: {
  connected: boolean;
  baseUrl: string | null;
  instance: string | null;
  targetNumber: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveWhatsappIntegration,
    {},
  );

  return (
    <div className="space-y-4 p-5">
      {connected ? (
        <div className="list-tile flex items-center gap-3 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-primary">
            <Check className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tracking-tight">Conectado</p>
            <p className="micro-label truncate">
              instância {instance} · avisa {targetNumber}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3">
        <p className="micro-label mb-1.5">O que dispara um aviso</p>
        <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
          <li>Nenhuma venda aprovada nos últimos 60 minutos.</li>
          <li>Uma conta de anúncio foi desativada na Meta.</li>
          <li>Uma Regra (aba Regras) pausou ou notificou algo.</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Checado a cada ~15min por um agendador externo — precisa do cron
          apontando pra <code className="font-mono text-foreground">/api/cron/alerts</code>,
          igual ao checkpoint diário.
        </p>
      </div>

      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="base_url">URL base da Evolution API</Label>
          <Input
            id="base_url"
            name="base_url"
            autoComplete="off"
            placeholder="https://sua-evolution.com"
            defaultValue={baseUrl ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="instance">Instância</Label>
            <Input
              id="instance"
              name="instance"
              autoComplete="off"
              placeholder="nome da instância"
              defaultValue={instance ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_number">Número de destino</Label>
            <Input
              id="target_number"
              name="target_number"
              autoComplete="off"
              placeholder="5511999998888 ou 120363...@g.us"
              defaultValue={targetNumber ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_key">API key</Label>
          <Input
            id="api_key"
            name="api_key"
            type="password"
            autoComplete="off"
            placeholder={connected ? "Deixe em branco para manter a atual" : "API key da instância"}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {connected ? "Atualizar" : "Conectar"}
          </Button>
          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          A conexão é testada antes de salvar. Deixe todos os campos em branco
          e salve para desconectar.
        </p>
      </form>
    </div>
  );
}
