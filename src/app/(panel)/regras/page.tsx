import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { RulesManager, type RuleRow } from "./rules-manager";

export const metadata: Metadata = { title: "Regras" };
export const dynamic = "force-dynamic";

export default async function RegrasPage() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para configurar regras.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();

  const [{ data: rules }, { data: executions }] = await Promise.all([
    supabase
      .from("automation_rules")
      .select("id, nome, nivel, metric, operator, value, period, action, ativa, last_run")
      .eq("area_id", activeArea.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("rule_executions")
      .select("id, ran_at, matched, action_taken, target_level, target_id, details, rule_id")
      .eq("area_id", activeArea.id)
      .order("ran_at", { ascending: false })
      .limit(50),
  ]);

  const ruleNames = new Map(
    (rules ?? []).map((r) => [r.id as string, r.nome as string]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Regras</h2>
        <p className="text-sm text-muted-foreground">
          Automação conservadora de campanhas. Roda de hora em hora pelo Vercel
          Cron, usando os mesmos dados já cacheados de Campanhas.
        </p>
      </div>

      <RulesManager rules={(rules ?? []) as RuleRow[]} />

      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico de execuções
          </span>
        </div>

        {!executions?.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma execução registrada ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {executions.map((exec) => {
              const details = (exec.details ?? {}) as Record<string, unknown>;
              return (
                <li
                  key={exec.id as string}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {ruleNames.get(exec.rule_id as string) ?? "Regra removida"}
                      {exec.matched ? (
                        <span
                          className={cn(
                            "ml-2 rounded-full px-2 py-0.5 text-[0.62rem]",
                            exec.action_taken === "pausado"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-[hsl(var(--primary)/0.15)] text-primary",
                          )}
                        >
                          {String(exec.action_taken ?? "—")}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs text-muted-foreground">
                          sem correspondências
                        </span>
                      )}
                    </p>
                    {exec.matched ? (
                      <p className="truncate font-mono text-[0.68rem] text-muted-foreground">
                        {String(details.entity_name ?? exec.target_id)} ·{" "}
                        {String(details.metric ?? "")}{" "}
                        {String(details.operator ?? "")}{" "}
                        {String(details.threshold ?? "")} · valor:{" "}
                        {typeof details.actual === "number"
                          ? details.actual.toFixed(2)
                          : "—"}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-[0.68rem] text-muted-foreground">
                    {new Date(exec.ran_at as string).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
