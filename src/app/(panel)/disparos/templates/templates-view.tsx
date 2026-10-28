"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardLabel } from "@/components/ui/card";

import { WhatsAppPreview } from "../whatsapp-preview";
import { TemplateForm } from "./template-form";

export type TemplateRow = {
  name: string;
  language: string;
  category: string;
  status: string;
  header: string;
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
  rejectedReason: string | null;
};

const STATUS: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Aprovado", className: "text-primary" },
  PENDING: { label: "Em análise", className: "text-amber" },
  REJECTED: { label: "Reprovado", className: "text-destructive" },
  PAUSED: { label: "Pausado", className: "text-amber" },
  DISABLED: { label: "Desativado", className: "text-muted-foreground" },
};

const CATEGORY: Record<string, string> = {
  UTILITY: "Utilidades",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

export function TemplatesView({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = templates.filter((t) => t.name.includes(query.trim().toLowerCase()));

  if (creating) {
    return (
      <Card>
        <CardHeader>
          <CardLabel>Novo template</CardLabel>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </CardHeader>
        <div className="p-5">
          <TemplateForm
            onDone={() => {
              setCreating(false);
              router.refresh();
            }}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar"
          aria-label="Pesquisar template"
          className="h-9 w-full max-w-56 rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] px-3 text-sm"
        />
        <Button type="button" variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> Novo template
        </Button>
      </CardHeader>
      {filtered.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Nenhum template ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="micro-label border-b border-border">
                <th className="px-5 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Idioma</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const key = `${t.name}|${t.language}`;
                const status = STATUS[t.status] ?? { label: t.status, className: "" };
                return (
                  <tr key={key} className="align-top">
                    <td className="px-5 py-2.5">
                      <button
                        type="button"
                        onClick={() => setOpen(open === key ? null : key)}
                        className="text-primary hover:underline"
                      >
                        {t.name}
                      </button>
                      {open === key ? (
                        <div className="mt-3 max-w-sm">
                          <WhatsAppPreview header={t.header} body={t.body} footer={t.footer} buttons={t.buttons} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{CATEGORY[t.category] ?? t.category}</td>
                    <td className="px-3 py-2.5 text-xs">{t.language}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className={status.className}>{status.label}</span>
                      {t.rejectedReason ? (
                        <span className="block text-muted-foreground">{t.rejectedReason}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
