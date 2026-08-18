"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveGa4Integration, type FormState } from "./actions";

export function Ga4Connect({
  connected,
  propertyId,
}: {
  connected: boolean;
  propertyId: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveGa4Integration,
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
            <p className="micro-label truncate">propriedade {propertyId}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3">
        <p className="micro-label mb-1.5">Antes de conectar</p>
        <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>
            Pode ser a <strong>mesma service account</strong> do Google Sheets — só
            precisa ativar a <strong>Google Analytics Data API</strong> no projeto do
            Google Cloud dela.
          </li>
          <li>
            No GA4: Admin → Gerenciamento de acesso à propriedade → adicione o{" "}
            <code className="font-mono text-foreground">client_email</code> da service
            account como <strong>Leitor</strong>.
          </li>
        </ol>
      </div>

      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="property_id">ID da propriedade</Label>
          <Input
            id="property_id"
            name="property_id"
            autoComplete="off"
            placeholder="Só o número — ex.: 537951042 (Admin → Detalhes da propriedade)"
            defaultValue={propertyId ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ga4_service_account_json">JSON da service account</Label>
          <textarea
            id="ga4_service_account_json"
            name="service_account_json"
            autoComplete="off"
            placeholder='{"type": "service_account", "client_email": "...", "private_key": "...", ...}'
            rows={4}
            className="w-full resize-y rounded-xl border border-border bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-[hsl(var(--primary)/0.5)]"
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
          A chave é validada contra a propriedade e cifrada antes de ir para o banco.
          Deixe os dois campos em branco e salve para desconectar.
        </p>
      </form>
    </div>
  );
}
