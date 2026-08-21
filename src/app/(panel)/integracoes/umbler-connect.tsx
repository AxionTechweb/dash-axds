"use client";

import { Check, Loader2, Search } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  discoverUmbler,
  saveUmblerIntegration,
  type DiscoverUmblerState,
  type FormState,
} from "./actions";

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
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

/**
 * Conexão da Umbler Talk em duas etapas, mesmo fluxo da Vturb/Meta:
 *   1. cola o token → o painel lista as organizações que ele enxerga;
 *   2. escolhe a organização → conecta.
 */
export function UmblerConnect({
  connected,
  organizationId,
}: {
  connected: boolean;
  organizationId: string | null;
}) {
  const [apiToken, setApiToken] = useState("");

  const [discovery, runDiscover, discovering] = useActionState<DiscoverUmblerState, FormData>(
    discoverUmbler,
    {},
  );
  const [connectState, runConnect, connecting] = useActionState<FormState, FormData>(
    saveUmblerIntegration,
    {},
  );

  const organizations = discovery.organizations ?? [];

  return (
    <div className="space-y-5 p-5">
      {connected ? (
        <div className="list-tile flex items-center gap-3 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-primary">
            <Check className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tracking-tight">Conectado</p>
            <p className="micro-label truncate">organização {organizationId}</p>
          </div>
        </div>
      ) : null}

      {/* Etapa 1 — token */}
      <form action={runDiscover} className="space-y-2">
        <Label htmlFor="api_token">Token da Umbler Talk</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="api_token"
            name="api_token"
            type="password"
            autoComplete="off"
            placeholder="Gerado em account.umbler.com → tokens de API"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            disabled={discovering || !apiToken.trim()}
            className="shrink-0"
          >
            {discovering ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Buscar organizações
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O token é validado na Umbler e cifrado antes de ir para o banco.
        </p>
        <Feedback state={{ error: discovery.error }} />
      </form>

      {/* Etapa 2 — escolher organização */}
      {organizations.length > 0 ? (
        <form action={runConnect} className="space-y-3">
          <input type="hidden" name="api_token" value={apiToken} />

          <p className="micro-label">{organizations.length} organização(ões) encontrada(s)</p>

          <ul className="space-y-1 rounded-xl border border-border p-1">
            {organizations.map((org) => (
              <li key={org.id}>
                <label
                  className={cn(
                    "list-tile flex cursor-pointer items-center gap-3 p-3",
                    org.id === organizationId && "opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="organization_id"
                    value={org.id}
                    defaultChecked={org.id === organizationId || organizations.length === 1}
                    className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">{org.name}</p>
                    <p className="micro-label truncate">{org.id}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Conectar
            </Button>
            <Feedback state={connectState} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
