"use client";

import { Check, ChevronRight, FileUp, Loader2, Send, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  MAX_FILE_BYTES,
  looksLikePhone,
  parseContactsFile,
  type ContactsFile,
} from "@/lib/meta-wa/contacts-file";
import { fillVariables } from "@/lib/meta-wa/template-spec";
import { cn } from "@/lib/utils";

import {
  createListCampaign,
  loadPanelContacts,
  type CampaignContact,
  type VariableMapping,
} from "../actions";
import { WhatsAppPreview } from "../whatsapp-preview";

export type WizardTemplate = {
  name: string;
  language: string;
  header: string;
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
  paramCount: number;
};

const STEPS = ["Início", "Contatos", "Canal", "Conteúdo", "Resumo", "Enviado"] as const;
const MAX_CAMPAIGN = 500;

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-start justify-between gap-1">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
              i < step && "border-primary bg-[hsl(var(--primary)/0.12)] text-primary",
              i === step && "border-primary bg-primary text-primary-foreground",
              i > step && "border-border text-muted-foreground",
            )}
          >
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("text-[11px]", i === step ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Choice({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="list-tile flex w-full items-center gap-3 p-4 text-left hover:border-[hsl(var(--primary)/0.35)]"
    >
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

type Source = "panel" | "file";
type ListState = { columns: string[]; rows: Record<string, string>[]; phoneColumn: string | null };

export function CampaignWizard({
  templates,
  displayPhone,
}: {
  templates: WizardTemplate[];
  displayPhone: string | null;
}) {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [list, setList] = useState<ListState | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [label, setLabel] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [mapping, setMapping] = useState<VariableMapping[]>([]);
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const template = templates.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;

  /** Contatos válidos, sem duplicar telefone (o servidor refaz e tira bloqueados). */
  const contacts: CampaignContact[] = useMemo(() => {
    if (!list?.phoneColumn) return [];
    const seen = new Set<string>();
    const out: CampaignContact[] = [];
    for (const row of list.rows) {
      const raw = row[list.phoneColumn] ?? "";
      if (!looksLikePhone(raw)) continue;
      const digits = raw.replace(/\D/g, "");
      if (seen.has(digits)) continue;
      seen.add(digits);
      out.push({ telefone: raw, values: row });
    }
    return out;
  }, [list]);
  const invalid = list ? list.rows.length - contacts.length : 0;

  function readFile(file: File) {
    setListError(null);
    if (!/\.(csv|vcf|txt)$/i.test(file.name)) {
      setListError("Envie um arquivo .csv ou .vcf.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setListError("Arquivo maior que 2 MB.");
      return;
    }
    file.text().then((text) => {
      const parsed: ContactsFile = parseContactsFile(text, file.name);
      if (parsed.rows.length === 0) {
        setListError("Não encontrei contatos nesse arquivo.");
        return;
      }
      setFileName(file.name);
      setList({ columns: parsed.columns, rows: parsed.rows, phoneColumn: parsed.phoneColumn });
    });
  }

  function loadPanel(audience: "leads" | "buyers") {
    setListError(null);
    startLoading(async () => {
      const res = await loadPanelContacts(audience);
      if (res.error) {
        setListError(res.error);
        return;
      }
      setFileName(audience === "leads" ? "Leads que não compraram" : "Compradores");
      setList({
        columns: ["Nome", "Telefone", "E-mail", "Produto"],
        rows: res.contacts.map((c) => c.values),
        phoneColumn: "Telefone",
      });
    });
  }

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => `${x.name}|${x.language}` === key);
    const nameCol = list?.columns.find((c) => /^nome|name/i.test(c));
    setMapping(
      Array.from({ length: t?.paramCount ?? 0 }, () =>
        nameCol ? { kind: "column", value: nameCol } : { kind: "text", value: "" },
      ),
    );
  }

  const sample = contacts[0]?.values ?? {};
  const previewBody = template
    ? fillVariables(
        template.body,
        mapping.map((m) => (m.kind === "text" ? m.value : sample[m.value] || `[${m.value}]`)),
      )
    : "";

  function send() {
    startSending(async () => {
      const res = await createListCampaign({
        label,
        template: templateKey,
        mapping,
        contacts,
        confirmTotal: Number(confirm),
      });
      setResult(res);
      if (res.ok) setStep(5);
      else if (res.total !== undefined) setConfirm("");
    });
  }

  const canNext =
    (step === 1 && contacts.length > 0 && contacts.length <= MAX_CAMPAIGN) ||
    step === 2 ||
    (step === 3 && template !== null && mapping.every((m) => m.value.trim()));

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Selecione o local dos seus contatos</p>
          <Choice
            icon={<Users className="size-5" />}
            title="Enviar para os contatos do painel"
            hint="Leads que deixaram telefone e não compraram, ou compradores."
            onClick={() => {
              setSource("panel");
              setList(null);
              setStep(1);
            }}
          />
          <Choice
            icon={<FileUp className="size-5" />}
            title="Enviar para contatos a partir de um arquivo (.csv ou .vcf)"
            hint="Faça o upload da lista com nome e número dos clientes."
            onClick={() => {
              setSource("file");
              setList(null);
              setStep(1);
            }}
          />
        </div>
      ) : null}

      {step === 1 && source === "panel" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Escolha o público</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => loadPanel("leads")} disabled={loading}>
              Leads que não compraram
            </Button>
            <Button type="button" variant="secondary" onClick={() => loadPanel("buyers")} disabled={loading}>
              Compradores
            </Button>
            {loading ? <Loader2 className="size-4 animate-spin self-center" /> : null}
          </div>
        </div>
      ) : null}

      {step === 1 && source === "file" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Escolha o arquivo com os seus contatos</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center",
              dragging && "border-primary bg-[hsl(var(--primary)/0.06)]",
            )}
          >
            <FileUp className="size-6 text-muted-foreground" />
            <p className="text-sm">Arraste seu arquivo para esta área</p>
            <p className="text-xs text-muted-foreground">Tipos de arquivos suportados: .csv, .vcf</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.vcf,.txt,text/csv,text/vcard"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="primary" size="sm" onClick={() => fileRef.current?.click()}>
              Importar arquivo com contatos
            </Button>
            <p className="text-[11px] text-muted-foreground">
              CSV: uma linha por cliente, com colunas como <code>nome;telefone</code>. Telefone com DDD.
            </p>
          </div>
        </div>
      ) : null}

      {step === 1 && list ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">
            <strong>{fileName}</strong> · {contacts.length} contato(s) válido(s)
            {invalid > 0 ? <span className="text-muted-foreground"> · {invalid} sem telefone válido ou repetido</span> : null}
          </p>
          {source === "file" ? (
            <div className="max-w-xs space-y-1">
              <Label>Coluna do telefone</Label>
              <select
                value={list.phoneColumn ?? ""}
                onChange={(e) => setList({ ...list, phoneColumn: e.target.value || null })}
                className={SELECT_CLASS}
              >
                <option value="">Escolha…</option>
                {list.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {contacts.length > MAX_CAMPAIGN ? (
            <p role="alert" className="text-xs text-destructive">
              Limite de {MAX_CAMPAIGN} contatos por campanha — divida a lista em partes.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="micro-label border-b border-border">
                  {list.columns.slice(0, 5).map((c) => (
                    <th key={c} className="px-2 py-1.5 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.slice(0, 5).map((c, i) => (
                  <tr key={i}>
                    {list.columns.slice(0, 5).map((col) => (
                      <td key={col} className="px-2 py-1.5">
                        {c.values[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === 1 && listError ? (
        <p role="alert" className="text-xs text-destructive">
          {listError}
        </p>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Canal de envio</p>
          <div className="list-tile flex items-center gap-3 border-[hsl(var(--primary)/0.35)] p-4">
            <Check className="size-4 text-primary" />
            <span className="text-sm">
              WhatsApp oficial (API da Meta){displayPhone ? ` · ${displayPhone}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="campaign-name">Nome da campanha</Label>
              <Input
                id="campaign-name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="Ex.: reengajamento outubro"
              />
            </div>
            <div className="space-y-1">
              <Label>Template aprovado</Label>
              <select value={templateKey} onChange={(e) => chooseTemplate(e.target.value)} className={SELECT_CLASS}>
                <option value="">Escolha…</option>
                {templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum template aprovado.{" "}
                  <Link href="/disparos/templates" className="text-primary underline underline-offset-2">
                    Criar template
                  </Link>
                </p>
              ) : null}
            </div>
            {mapping.map((m, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{`Variável {{${i + 1}}}`}</Label>
                  <select
                    value={m.kind === "text" ? "__text" : m.value}
                    onChange={(e) =>
                      setMapping(
                        mapping.map((x, j) =>
                          j === i
                            ? e.target.value === "__text"
                              ? { kind: "text", value: "" }
                              : { kind: "column", value: e.target.value }
                            : x,
                        ),
                      )
                    }
                    className={SELECT_CLASS}
                  >
                    {(list?.columns ?? []).map((c) => (
                      <option key={c} value={c}>
                        Coluna: {c}
                      </option>
                    ))}
                    <option value="__text">Texto fixo…</option>
                  </select>
                </div>
                {m.kind === "text" ? (
                  <div className="space-y-1">
                    <Label>Texto</Label>
                    <Input
                      value={m.value}
                      maxLength={60}
                      onChange={(e) =>
                        setMapping(mapping.map((x, j) => (j === i ? { kind: "text", value: e.target.value } : x)))
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {template ? (
            <WhatsAppPreview header={template.header} body={previewBody} footer={template.footer} buttons={template.buttons} />
          ) : null}
        </div>
      ) : null}

      {step === 4 && template ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3 text-sm">
            <p className="font-medium text-primary">Resumo</p>
            <ul className="space-y-1.5">
              <li>
                Campanha: <strong>{label || "campanha"}</strong>
              </li>
              <li>
                Contatos: <strong>{contacts.length}</strong>{" "}
                <span className="text-muted-foreground">(números bloqueados saem na hora do envio)</span>
              </li>
              <li>
                Template: <strong>{template.name}</strong>
              </li>
              <li>Canal: WhatsApp oficial{displayPhone ? ` · ${displayPhone}` : ""}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Só envie para quem aceitou receber mensagens — a Meta restringe o número por denúncias.
              Cada mensagem é cobrada pela Meta.
            </p>
            <div className="max-w-xs space-y-1">
              <Label htmlFor="confirm-total">Digite o total de contatos para confirmar</Label>
              <Input
                id="confirm-total"
                inputMode="numeric"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            {result.error ? (
              <p role="alert" className="text-xs text-destructive">
                {result.error}
              </p>
            ) : null}
            <Button type="button" variant="primary" onClick={send} disabled={sending || !confirm}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar campanha
            </Button>
          </div>
          <WhatsAppPreview header={template.header} body={previewBody} footer={template.footer} buttons={template.buttons} />
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] text-primary">
            <Check className="size-5" />
          </span>
          <p className="text-sm font-medium">Campanha enviada para a fila</p>
          <p className="text-xs text-muted-foreground">{result.ok}</p>
          <Link href="/disparos" className="text-sm text-primary underline underline-offset-2">
            Ver histórico de disparos
          </Link>
        </div>
      ) : null}

      {step > 0 && step < 5 ? (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={sending}>
            Voltar
          </Button>
          {step < 4 ? (
            <Button type="button" variant="primary" onClick={() => setStep(step + 1)} disabled={!canNext}>
              Avançar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
