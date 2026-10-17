"use client";

import { Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEFAULT_URL_TAGS } from "@/lib/meta/create-config";

import { applyUrlTagsBatchAction, urlTagsStatusAction } from "./actions";

type Failure = { adId: string; name: string; error: string };

/**
 * Aplica os parâmetros de URL padrão nos anúncios que já existem na conta.
 * Roda em lotes (cada chamada trata até 15 anúncios) até não sobrar nenhum.
 */
export function UrlTagsForm({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<{ total: number; missing: number } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<Failure[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = () =>
    urlTagsStatusAction(accountId).then((result) => {
      setStatusError(result.error ?? null);
      if (!result.error) setStatus({ total: result.total ?? 0, missing: result.missing ?? 0 });
    });

  useEffect(() => {
    let cancelled = false;
    urlTagsStatusAction(accountId).then((result) => {
      if (cancelled) return;
      setStatusError(result.error ?? null);
      if (!result.error) setStatus({ total: result.total ?? 0, missing: result.missing ?? 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const run = async () => {
    if (!status || status.missing === 0) return;
    const ok = window.confirm(
      `Aplicar os parâmetros em ${status.missing} anúncio(s)? Cada um ganha um criativo novo e volta para revisão da Meta (pode pausar a entrega por alguns minutos).`,
    );
    if (!ok) return;

    setRunning(true);
    setMessage(null);
    setFailed([]);

    let totalUpdated = 0;
    const allFailed: Failure[] = [];
    for (;;) {
      const result = await applyUrlTagsBatchAction(
        accountId,
        allFailed.map((f) => f.adId),
      );
      if (result.error) {
        setMessage(`Parou: ${result.error}`);
        break;
      }
      totalUpdated += result.updated ?? 0;
      allFailed.push(...(result.failed ?? []));
      setFailed([...allFailed]);
      setMessage(`${totalUpdated} atualizado(s)… faltam ${result.remaining ?? 0}`);
      if (!result.remaining) {
        setMessage(`Pronto: ${totalUpdated} anúncio(s) atualizado(s)${allFailed.length ? `, ${allFailed.length} com erro` : ""}.`);
        break;
      }
    }

    setRunning(false);
    loadStatus();
  };

  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">
        Coloca nos anúncios que já existem nesta conta os mesmos parâmetros que os anúncios novos recebem:
      </p>
      <code className="block break-all rounded-xl border border-border p-3 font-mono text-xs">
        {DEFAULT_URL_TAGS}
      </code>
      <p className="text-xs text-muted-foreground">
        A Meta não deixa editar um criativo pronto: cada anúncio ganha um criativo novo igual ao atual, só com os
        parâmetros, e volta para revisão. Anúncios ativos podem ficar alguns minutos sem entregar durante a revisão.
      </p>

      {statusError ? (
        <p role="alert" className="text-sm text-destructive">
          {statusError}
        </p>
      ) : status ? (
        <p className="text-sm">
          {status.missing === 0
            ? `Todos os ${status.total} anúncio(s) já estão com os parâmetros.`
            : `${status.missing} de ${status.total} anúncio(s) ainda sem os parâmetros.`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Contando os anúncios da conta…</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={run} disabled={running || !status || status.missing === 0}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          Aplicar nos anúncios existentes
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      {failed.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-border p-3">
          <p className="text-xs font-medium">
            {failed.length} anúncio(s) não atualizado(s):
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {failed.map((f) => (
              <li key={f.adId} className="text-xs text-muted-foreground">
                <span className="text-foreground">{f.name}</span> ({f.adId}): {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
