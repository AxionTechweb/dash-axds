/**
 * Formato do template montado no painel (Disparos → Templates) e as regras da
 * Meta para ele. Compartilhado: o formulário valida enquanto a pessoa digita
 * e o servidor valida de novo antes de mandar para a Meta.
 */

export type TemplateButton =
  | { type: "URL"; text: string; url: string; dynamic: boolean; example?: string }
  | { type: "QUICK_REPLY"; text: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  | { type: "COPY_CODE"; example: string };

export type TemplateVariable = { name: string; example: string };

export type TemplateSpec = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  /** Deixa a Meta mudar a categoria se discordar (em vez de reprovar). */
  allowCategoryChange: boolean;
  headerText: string;
  body: string;
  variables: TemplateVariable[];
  footer: string;
  buttons: TemplateButton[];
};

export const BUTTON_LABEL: Record<TemplateButton["type"], string> = {
  URL: "Acessar um site",
  QUICK_REPLY: "Resposta rápida",
  PHONE_NUMBER: "Fazer uma ligação",
  COPY_CODE: "Copiar código",
};

/** Quantidade de variáveis distintas {{n}} no texto. */
export function countVariables(text: string): number {
  return new Set(text.match(/\{\{\d+\}\}/g) ?? []).size;
}

/** Texto com {{n}} trocado pelos exemplos — usado na prévia. */
export function fillVariables(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (match, n: string) => values[Number(n) - 1] || match);
}

/** Primeira regra da Meta que o template quebra, ou null se está ok. */
export function validateTemplate(spec: TemplateSpec): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(spec.name)) {
    return "Nome do template: só letras minúsculas, números e _ (ex.: boas_vindas_v1).";
  }
  if (!spec.body.trim()) return "Escreva o texto da mensagem.";
  if (spec.body.length > 1024) return "Texto da mensagem passa de 1024 caracteres.";
  if (spec.headerText.length > 60) return "Cabeçalho passa de 60 caracteres.";
  if (/\{\{\d+\}\}/.test(spec.headerText)) return "Use variáveis só no texto da mensagem.";
  if (spec.footer.length > 60) return "Rodapé passa de 60 caracteres.";

  const used = (spec.body.match(/\{\{(\d+)\}\}/g) ?? []).map((m) => Number(m.slice(2, -2)));
  const distinct = [...new Set(used)].sort((a, b) => a - b);
  if (distinct.some((n, i) => n !== i + 1)) {
    return "As variáveis precisam ser {{1}}, {{2}}, {{3}}… em sequência.";
  }
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(spec.body)) {
    return "A Meta não aceita mensagem começando ou terminando com variável.";
  }
  if (spec.variables.length !== distinct.length) {
    return "Cada variável do texto precisa de um exemplo.";
  }
  if (spec.variables.some((v) => !v.example.trim())) return "Preencha o exemplo de cada variável.";

  if (spec.buttons.length > 10) return "No máximo 10 botões.";
  const count = (type: TemplateButton["type"]) => spec.buttons.filter((b) => b.type === type).length;
  if (count("URL") > 2) return "No máximo 2 botões de site.";
  if (count("PHONE_NUMBER") > 1) return "No máximo 1 botão de ligação.";
  if (count("COPY_CODE") > 1) return "No máximo 1 botão de copiar código.";
  for (const b of spec.buttons) {
    if (b.type !== "COPY_CODE" && (!b.text.trim() || b.text.length > 25)) {
      return "Texto do botão: obrigatório e até 25 caracteres.";
    }
    if (b.type === "URL") {
      if (!/^https:\/\/[^\s]+$/.test(b.url)) return "URL do botão precisa começar com https://.";
      if (b.dynamic && !b.url.endsWith("{{1}}")) {
        return "URL dinâmica precisa terminar com {{1}} (ex.: https://site.com/pedido/{{1}}).";
      }
      if (b.dynamic && !b.example?.trim()) return "Informe um exemplo para a URL dinâmica.";
    }
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{10,15}$/.test(b.phone.replace(/[\s()-]/g, ""))) {
      return "Telefone do botão inválido (use DDI + DDD + número).";
    }
    if (b.type === "COPY_CODE" && (!b.example.trim() || b.example.length > 15)) {
      return "Código de exemplo: obrigatório e até 15 caracteres.";
    }
  }
  return null;
}

/** Corpo do POST /{waba_id}/message_templates. */
export function toMetaPayload(spec: TemplateSpec): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (spec.headerText.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: spec.headerText.trim() });
  }
  components.push({
    type: "BODY",
    text: spec.body,
    ...(spec.variables.length > 0
      ? { example: { body_text: [spec.variables.map((v) => v.example.trim())] } }
      : {}),
  });
  if (spec.footer.trim()) components.push({ type: "FOOTER", text: spec.footer.trim() });
  if (spec.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: spec.buttons.map((b) => {
        switch (b.type) {
          case "URL":
            return {
              type: "URL",
              text: b.text.trim(),
              url: b.url,
              ...(b.dynamic ? { example: [b.url.replace("{{1}}", b.example?.trim() ?? "")] } : {}),
            };
          case "QUICK_REPLY":
            return { type: "QUICK_REPLY", text: b.text.trim() };
          case "PHONE_NUMBER":
            return {
              type: "PHONE_NUMBER",
              text: b.text.trim(),
              phone_number: `+${b.phone.replace(/\D/g, "")}`,
            };
          case "COPY_CODE":
            return { type: "COPY_CODE", example: b.example.trim() };
        }
      }),
    });
  }
  return {
    name: spec.name,
    language: spec.language,
    category: spec.category,
    allow_category_change: spec.allowCategoryChange,
    components,
  };
}
