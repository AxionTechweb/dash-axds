"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  BUTTON_LABEL,
  fillVariables,
  validateTemplate,
  type TemplateButton,
  type TemplateSpec,
  type TemplateVariable,
} from "@/lib/meta-wa/template-spec";

import { createTemplateAction, type FormState } from "../actions";
import { WhatsAppPreview } from "../whatsapp-preview";

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function Section({ title, optional, children }: { title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        {title}
        {optional ? <span className="micro-label rounded bg-[hsl(var(--foreground)/0.06)] px-1.5 py-0.5">Opcional</span> : null}
      </p>
      {children}
    </div>
  );
}

function newButton(type: TemplateButton["type"]): TemplateButton {
  switch (type) {
    case "URL":
      return { type, text: "", url: "https://", dynamic: false, example: "" };
    case "QUICK_REPLY":
      return { type, text: "" };
    case "PHONE_NUMBER":
      return { type, text: "", phone: "55" };
    case "COPY_CODE":
      return { type, example: "" };
  }
}

/** "Novo template" — mesmo formulário do Umbler, enviando direto para a Meta. */
export function TemplateForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateSpec["category"]>("UTILITY");
  const [autoCategory, setAutoCategory] = useState(true);
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const spec: TemplateSpec = {
    name,
    language: "pt_BR",
    category,
    allowCategoryChange: autoCategory,
    headerText,
    body,
    variables,
    footer,
    buttons,
  };

  /** Insere {{n}} onde está o cursor e cria a linha nome/exemplo. */
  function addVariable() {
    const n = variables.length + 1;
    const token = `{{${n}}}`;
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? body.length;
    setBody(`${body.slice(0, pos)}${token}${body.slice(pos)}`);
    setVariables([...variables, { name: "", example: "" }]);
  }

  function removeVariable(index: number) {
    // Remove o {{n}} do texto e renumera os seguintes.
    let text = body.split(`{{${index + 1}}}`).join("");
    for (let n = index + 2; n <= variables.length; n += 1) {
      text = text.split(`{{${n}}}`).join(`{{${n - 1}}}`);
    }
    setBody(text);
    setVariables(variables.filter((_, i) => i !== index));
  }

  function updateButton(index: number, patch: Partial<TemplateButton>) {
    setButtons(buttons.map((b, i) => (i === index ? ({ ...b, ...patch } as TemplateButton) : b)));
  }

  function submit() {
    const invalid = validateTemplate(spec);
    if (invalid) {
      setState({ error: invalid });
      return;
    }
    startTransition(async () => {
      const result = await createTemplateAction(spec);
      setState(result);
      if (result.ok) onDone?.();
    });
  }

  const preview = fillVariables(
    body,
    variables.map((v) => v.example),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <p className="rounded-lg bg-[hsl(var(--primary)/0.08)] px-3 py-2 text-xs text-primary">
          A aprovação ou rejeição do template pode levar até 24 horas após a criação.
        </p>

        <div className="space-y-2">
          <Label htmlFor="tpl-name">Nome do template *</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="Ex.: boas_vindas_v1, confirmacao_pedido"
            maxLength={512}
          />
        </div>

        <Section title="Categoria da mensagem">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TemplateSpec["category"])}
            className={SELECT_CLASS}
          >
            <option value="UTILITY">Utilidade (pedido, acesso, lembrete)</option>
            <option value="MARKETING">Marketing (oferta, promoção)</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoCategory}
              onChange={(e) => setAutoCategory(e.target.checked)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Automático — deixar a Meta ajustar a categoria
          </label>
        </Section>

        <Section title="Cabeçalho" optional>
          <Input
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="Texto curto no topo da mensagem (até 60)"
            maxLength={60}
          />
        </Section>

        <Section title="Conteúdo da mensagem">
          <Label htmlFor="tpl-body">Texto da mensagem *</Label>
          <textarea
            id="tpl-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={1024}
            placeholder="Olá {{1}}, seu pedido foi confirmado!"
            className={TEXTAREA_CLASS}
          />
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={addVariable} disabled={variables.length >= 10}>
              <Plus className="size-3.5" /> Adicionar variável
            </Button>
          </div>
          {variables.map((v, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{`Variável ${i + 1} — {{${i + 1}}}`}</p>
                <button
                  type="button"
                  onClick={() => removeVariable(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remover variável ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nome da variável</Label>
                  <Input
                    value={v.name}
                    onChange={(e) =>
                      setVariables(variables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="Ex.: nome do cliente"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Exemplo *</Label>
                  <Input
                    value={v.example}
                    onChange={(e) =>
                      setVariables(variables.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))
                    }
                    placeholder="Ex.: Maria"
                  />
                </div>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Rodapé" optional>
          <Input
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Ex.: Responda SAIR para não receber mais"
            maxLength={60}
          />
        </Section>

        <Section title="Botões" optional>
          <p className="text-xs text-muted-foreground">
            Crie botões para acessar um site, responder uma pergunta, fazer uma ligação ou copiar um
            código promocional.
          </p>
          {buttons.map((b, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{BUTTON_LABEL[b.type]}</p>
                <button
                  type="button"
                  onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover botão"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Tipo de ação</Label>
                  <select
                    value={b.type}
                    onChange={(e) =>
                      setButtons(buttons.map((x, j) => (j === i ? newButton(e.target.value as TemplateButton["type"]) : x)))
                    }
                    className={SELECT_CLASS}
                  >
                    {(Object.keys(BUTTON_LABEL) as TemplateButton["type"][]).map((t) => (
                      <option key={t} value={t}>
                        {BUTTON_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                {b.type === "COPY_CODE" ? (
                  <div className="space-y-1">
                    <Label>Código de exemplo *</Label>
                    <Input
                      value={b.example}
                      onChange={(e) => updateButton(i, { example: e.target.value })}
                      placeholder="Ex.: DESCONTO10"
                      maxLength={15}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Texto do botão *</Label>
                    <Input
                      value={b.text}
                      onChange={(e) => updateButton(i, { text: e.target.value })}
                      placeholder={
                        b.type === "URL" ? "Ex.: Acessar site" : b.type === "PHONE_NUMBER" ? "Ex.: Ligar agora" : "Ex.: Sim, confirmar"
                      }
                      maxLength={25}
                    />
                  </div>
                )}
              </div>
              {b.type === "URL" ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
                  <div className="space-y-1">
                    <Label>Tipo de URL</Label>
                    <select
                      value={b.dynamic ? "dynamic" : "static"}
                      onChange={(e) => updateButton(i, { dynamic: e.target.value === "dynamic" })}
                      className={SELECT_CLASS}
                    >
                      <option value="static">Estático</option>
                      <option value="dynamic">Dinâmico</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>URL do site</Label>
                    <Input
                      value={b.url}
                      onChange={(e) => updateButton(i, { url: e.target.value })}
                      placeholder={b.dynamic ? "https://seusite.com.br/pedido/{{1}}" : "https://www.seusite.com.br"}
                    />
                  </div>
                  {b.dynamic ? (
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Exemplo do final da URL *</Label>
                      <Input
                        value={b.example ?? ""}
                        onChange={(e) => updateButton(i, { example: e.target.value })}
                        placeholder="Ex.: 12345"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {b.type === "PHONE_NUMBER" ? (
                <div className="space-y-1">
                  <Label>Telefone (com DDI)</Label>
                  <Input
                    value={b.phone}
                    onChange={(e) => updateButton(i, { phone: e.target.value })}
                    placeholder="5511999999999"
                  />
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setButtons([...buttons, newButton("URL")])}
              disabled={buttons.length >= 10}
            >
              <Plus className="size-3.5" /> Adicionar botão
            </Button>
          </div>
        </Section>

        <div className="space-y-2">
          <Button type="button" variant="primary" className="w-full justify-center" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar template
          </Button>
          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}
        </div>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <WhatsAppPreview
          header={headerText}
          body={preview}
          footer={footer}
          buttons={buttons.map((b) => ({ type: b.type, text: b.type === "COPY_CODE" ? "Copiar código" : b.text }))}
        />
      </div>
    </div>
  );
}
