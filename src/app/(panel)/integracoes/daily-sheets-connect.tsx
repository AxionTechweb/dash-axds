"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveDailyCampaignSheetsIntegration, type FormState } from "./actions";
import { CopyBox } from "./integration-forms";

export function DailySheetsConnect({
  baseUrl,
  connected,
  spreadsheetId,
  templateTabName,
}: {
  baseUrl: string;
  connected: boolean;
  spreadsheetId: string | null;
  templateTabName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveDailyCampaignSheetsIntegration,
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
            <p className="micro-label truncate">{spreadsheetId}</p>
          </div>
          <a
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Abrir a planilha"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3">
        <p className="micro-label mb-1.5">Antes de conectar</p>
        <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>
            Pode ser a <strong>mesma service account</strong> do relatório semanal (só
            compartilhar essa planilha também com o <code className="font-mono">
              client_email
            </code>{" "}
            dela) ou uma diferente.
          </li>
          <li>
            Na planilha, a aba <code className="font-mono text-foreground">{templateTabName}</code>{" "}
            precisa ter as 10 linhas de horário de checkpoint prontas (com as fórmulas de
            CPA/ROAS/IMPOSTO/LUCRO já no lugar) — é ela que é duplicada por dia e por
            campanha.
          </li>
          <li>
            Só as colunas <strong>FATURAMENTO, INVEST., CPM, CTR, CPC, CPV, CPI</strong> e{" "}
            <strong>VENDAS</strong> são escritas automaticamente. As fórmulas e{" "}
            <strong>AÇÃO/RESULTADO</strong> nunca são tocadas.
          </li>
        </ol>
      </div>

      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="daily_spreadsheet">URL ou ID da planilha</Label>
          <Input
            id="daily_spreadsheet"
            name="spreadsheet"
            autoComplete="off"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            defaultValue={spreadsheetId ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="daily_service_account_json">JSON da service account</Label>
          <textarea
            id="daily_service_account_json"
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
          A chave é validada contra a planilha e cifrada antes de ir para o banco.
          Deixe os dois campos em branco e salve para desconectar.
        </p>
      </form>

      <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3">
        <p className="micro-label mb-1.5">Agendador externo (fora deste painel)</p>
        <p className="mb-2 text-xs text-muted-foreground">
          A Vercel (plano Hobby) só roda cron nativo 1x/dia — quem dispara os checkpoints
          de hora em hora é um agendador externo (ex.:{" "}
          <a
            href="https://cron-job.org"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            cron-job.org
          </a>
          , grátis). Configure UM job, de hora em hora, chamando:
        </p>
        <CopyBox label="URL do checkpoint diário" value={`${baseUrl}/api/cron/daily-campaigns`} />
        <p className="mt-2 text-xs text-muted-foreground">
          Com o header <code className="font-mono text-foreground">Authorization: Bearer
          &lt;CRON_SECRET&gt;</code> — o mesmo valor já configurado nas variáveis de
          ambiente da Vercel. A rota decide sozinha se a hora atual é um checkpoint; fora
          dos 10 horários, não faz nada.
        </p>
      </div>
    </div>
  );
}
