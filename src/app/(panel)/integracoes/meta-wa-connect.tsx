"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveMetaWaIntegration, type FormState } from "./actions";

export function MetaWaConnect({
  connected,
  wabaId,
  phoneNumberId,
  displayPhone,
}: {
  connected: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveMetaWaIntegration,
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
              {displayPhone ? `${displayPhone} · ` : ""}WABA {wabaId}
            </p>
          </div>
        </div>
      ) : null}

      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="waba_id">WABA ID</Label>
            <Input
              id="waba_id"
              name="waba_id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="ID da conta do WhatsApp Business"
              defaultValue={wabaId ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_number_id">Phone Number ID</Label>
            <Input
              id="phone_number_id"
              name="phone_number_id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="ID do número remetente"
              defaultValue={phoneNumberId ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="access_token">Token de acesso permanente</Label>
          <Input
            id="access_token"
            name="access_token"
            type="password"
            autoComplete="off"
            placeholder={
              connected ? "Deixe em branco para manter o atual" : "Token do usuário do sistema"
            }
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
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
          Crie um usuário do sistema no Meta Business com as permissões
          <span className="font-mono text-foreground"> whatsapp_business_messaging </span>
          e
          <span className="font-mono text-foreground"> whatsapp_business_management</span>.
          O token é validado na Meta e cifrado antes de ir para o banco. Deixe todos os campos em
          branco e salve para desconectar. As regras de disparo ficam na página Disparos.
        </p>
      </form>
    </div>
  );
}
