"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RULE_METRICS } from "@/lib/rules/metrics";
import { cn } from "@/lib/utils";

import { deleteRule, saveRule, toggleRule, type RuleState } from "./actions";

export type RuleRow = {
  id: string;
  nome: string;
  nivel: "campanha" | "conjunto" | "anuncio";
  metric: string;
  operator: ">" | "<";
  value: number;
  period: string;
  action: "pausar" | "notificar";
  ativa: boolean;
  last_run: string | null;
};

const PERIOD_LABEL: Record<string, string> = {
  today: "hoje",
  yesterday: "ontem",
  "7d": "7 dias",
  "30d": "30 dias",
};

const NIVEL_LABEL: Record<string, string> = {
  campanha: "Campanha",
  conjunto: "Conjunto",
  anuncio: "Anúncio",
};

function metricLabel(key: string) {
  return RULE_METRICS.find((m) => m.key === key)?.label ?? key;
}

export function RulesManager({ rules }: { rules: RuleRow[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          Nova regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma regra criada. As regras usam os mesmos dados já cacheados de
          Campanhas e rodam de hora em hora.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rules.map((rule) => (
            <RuleItem key={rule.id} rule={rule} />
          ))}
        </ul>
      )}

      <RuleDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function RuleItem({ rule }: { rule: RuleRow }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              rule.ativa ? "bg-primary" : "bg-muted-foreground/50",
            )}
          />
          <p className="truncate text-sm font-medium">{rule.nome}</p>
          <span className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] text-muted-foreground">
            {NIVEL_LABEL[rule.nivel]}
          </span>
        </div>
        <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
          SE {metricLabel(rule.metric)} {rule.operator} {rule.value} em{" "}
          {PERIOD_LABEL[rule.period] ?? rule.period} ENTÃO{" "}
          {rule.action === "pausar" ? "pausar" : "notificar"}
          {rule.last_run
            ? ` · última execução ${new Date(rule.last_run).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
            : " · nunca executada"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <form action={toggleRule}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="ativa" value={String(!rule.ativa)} />
          <Button type="submit" size="sm" variant="outline">
            {rule.ativa ? "Desativar" : "Ativar"}
          </Button>
        </form>

        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </Button>

        <form action={deleteRule}>
          <input type="hidden" name="id" value={rule.id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </form>
      </div>

      <RuleDialog open={editing} onOpenChange={setEditing} rule={rule} />
    </li>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule?: RuleRow;
}) {
  const [state, formAction, pending] = useActionState<RuleState, FormData>(
    saveRule,
    {},
  );

  const selectClass =
    "h-10 w-full rounded-md border border-border bg-[hsl(var(--input)/0.35)] px-2 text-sm";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <Zap className="size-4 text-primary" />
            {rule ? "Editar regra" : "Nova regra"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Ações conservadoras: a regra só pode <strong>pausar</strong> ou{" "}
            <strong>notificar</strong> — nunca aumentar orçamento nem ativar.
          </Dialog.Description>

          <form
            action={(fd) => {
              formAction(fd);
              onOpenChange(false);
            }}
            className="mt-4 space-y-4"
          >
            {rule ? <input type="hidden" name="id" value={rule.id} /> : null}

            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                name="nome"
                required
                defaultValue={rule?.nome}
                placeholder="Ex.: Pausar anúncio com CPA alto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nivel">Nível</Label>
                <select
                  id="nivel"
                  name="nivel"
                  defaultValue={rule?.nivel ?? "anuncio"}
                  className={selectClass}
                >
                  <option value="campanha">Campanha</option>
                  <option value="conjunto">Conjunto</option>
                  <option value="anuncio">Anúncio</option>
                </select>
              </div>
              <div>
                <Label htmlFor="period">Período</Label>
                <select
                  id="period"
                  name="period"
                  defaultValue={rule?.period ?? "7d"}
                  className={selectClass}
                >
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label htmlFor="metric">Métrica</Label>
                <select
                  id="metric"
                  name="metric"
                  defaultValue={rule?.metric ?? "cpa"}
                  className={selectClass}
                >
                  {RULE_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="operator">Condição</Label>
                <select
                  id="operator"
                  name="operator"
                  defaultValue={rule?.operator ?? ">"}
                  className={selectClass}
                >
                  <option value=">">maior que</option>
                  <option value="<">menor que</option>
                </select>
              </div>
              <div>
                <Label htmlFor="value">Valor</Label>
                <Input
                  id="value"
                  name="value"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={rule?.value}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="action">Ação</Label>
              <select
                id="action"
                name="action"
                defaultValue={rule?.action ?? "notificar"}
                className={selectClass}
              >
                <option value="notificar">Notificar (WhatsApp, sem pausar)</option>
                <option value="pausar">Pausar na Meta</option>
              </select>
            </div>

            {state.error ? (
              <p className="text-xs text-destructive">{state.error}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="ghost">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={pending}
              >
                {pending ? "Salvando..." : "Salvar regra"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
