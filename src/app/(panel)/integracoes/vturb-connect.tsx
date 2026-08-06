"use client";

import { Check, Loader2, Search, Trash2, Video } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  connectVturb,
  deleteVturbPlayer,
  discoverVturb,
  type DiscoverVturbState,
  type FormState,
} from "./actions";

export type VturbPlayerRow = {
  id: string;
  playerId: string;
  label: string;
};

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

function ConnectedPlayer({ player }: { player: VturbPlayerRow }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteVturbPlayer,
    {},
  );

  return (
    <li className="list-tile flex items-center gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-primary">
        <Video className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">
          {player.label}
        </p>
        <p className="micro-label truncate">{player.playerId}</p>
      </div>

      <form action={action}>
        <input type="hidden" name="id" value={player.id} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          disabled={pending}
          aria-label={`Remover ${player.label}`}
          title={state.error ?? "Remover do monitoramento"}
        >
          <Trash2 className="size-4" />
        </Button>
      </form>
    </li>
  );
}

/**
 * Conexão da Vturb em duas etapas, mesmo fluxo da Meta:
 *   1. cola a API key → o painel LISTA todos os vídeos que ela enxerga;
 *   2. marca quais entram no relatório semanal → conecta de uma vez.
 */
export function VturbConnect({ players }: { players: VturbPlayerRow[] }) {
  const [apiKey, setApiKey] = useState("");

  const [discovery, runDiscover, discovering] = useActionState<
    DiscoverVturbState,
    FormData
  >(discoverVturb, {});

  const [connectState, runConnect, connecting] = useActionState<
    FormState,
    FormData
  >(connectVturb, {});

  const connectedIds = new Set(players.map((p) => p.playerId));
  const found = discovery.players ?? [];

  return (
    <div className="space-y-5 p-5">
      {players.length > 0 ? (
        <div>
          <p className="micro-label mb-2">Vídeos monitorados</p>
          <ul className="space-y-1">
            {players.map((player) => (
              <ConnectedPlayer key={player.id} player={player} />
            ))}
          </ul>
        </div>
      ) : null}

      {/* Etapa 1 — API key */}
      <form action={runDiscover} className="space-y-2">
        <Label htmlFor="api_key">API key da Vturb</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="api_key"
            name="api_key"
            type="password"
            autoComplete="off"
            placeholder="Settings > Analytics API, no painel da Vturb"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            disabled={discovering || !apiKey.trim()}
            className="shrink-0"
          >
            {discovering ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Buscar vídeos
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A chave é validada na Vturb e cifrada antes de ir para o banco. O
          painel nunca a exibe de volta.
        </p>
        <Feedback state={{ error: discovery.error }} />
      </form>

      {/* Etapa 2 — escolher vídeos */}
      {found.length > 0 ? (
        <form action={runConnect} className="space-y-3">
          <input type="hidden" name="api_key" value={apiKey} />

          <div className="flex items-baseline justify-between gap-3">
            <p className="micro-label">{found.length} vídeo(s) encontrado(s)</p>
            <p className="micro-label">marque os que entram no relatório</p>
          </div>

          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {found.map((player) => {
              const already = connectedIds.has(player.id);

              return (
                <li key={player.id}>
                  <label
                    className={cn(
                      "list-tile flex cursor-pointer items-center gap-3 p-3",
                      already && "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="selected"
                      value={player.id}
                      defaultChecked={already}
                      className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium tracking-tight">
                        {player.name}
                      </p>
                      <p className="micro-label truncate">{player.id}</p>
                    </div>
                    {already ? (
                      <span className="micro-label shrink-0 text-primary">
                        monitorado
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Conectar selecionados
            </Button>
            <Feedback state={connectState} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
