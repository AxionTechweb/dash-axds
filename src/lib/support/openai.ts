import "server-only";

/**
 * Client fino pra Responses API da OpenAI — fetch direto, sem SDK, mesmo
 * espírito do resto do projeto (Meta/VTurb/Umbler/antigo Gemini).
 *
 * Validado ao vivo antes de implementar: modelo `gpt-6-luna`, endpoint
 * `/v1/responses`. A Responses API é STATEFUL — `previous_response_id`
 * encadeia o turno anterior, então só manda o item NOVO a cada chamada (o
 * resultado de uma ferramenta, por exemplo), nunca a conversa inteira de
 * novo — diferente do client antigo do Gemini, que resendava tudo.
 */

const OPENAI_API_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-6-luna";

export type OpenAITool = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: string; description?: string; enum?: string[] }
    >;
    required: string[];
    additionalProperties: false;
  };
  strict: true;
};

export type OpenAIInputContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" };

export type OpenAIInputItem =
  | { role: "user" | "developer"; content: string | OpenAIInputContentPart[] }
  | { type: "function_call_output"; call_id: string; output: string };

export type OpenAIOutputItem =
  | {
      type: "message";
      role: "assistant";
      content: { type: "output_text"; text: string }[];
    }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  // Itens que não nos interessam (ex.: "reasoning") — só ignorados.
  | { type: string; [key: string]: unknown };

export function isFunctionCallItem(
  item: OpenAIOutputItem,
): item is { type: "function_call"; call_id: string; name: string; arguments: string } {
  return item.type === "function_call";
}

export function isMessageItem(
  item: OpenAIOutputItem,
): item is { type: "message"; role: "assistant"; content: { type: "output_text"; text: string }[] } {
  return item.type === "message";
}

export type OpenAIResult =
  | { ok: true; responseId: string; output: OpenAIOutputItem[] }
  | { ok: false; error: string };

// Retries curtos só pra 429 — mesmo padrão já validado no client do Gemini
// (instabilidade transitória de rate limit, uma chamada falha e a próxima
// segundos depois passa).
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1500;

async function callOpenAI(
  apiKey: string,
  instructions: string,
  input: OpenAIInputItem[],
  tools: OpenAITool[],
  previousResponseId: string | null,
) {
  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions,
      input,
      tools: tools.length > 0 ? tools : undefined,
      previous_response_id: previousResponseId ?? undefined,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as {
    id?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
  } | null;

  return { status: response.status, data };
}

export async function generateContent(
  instructions: string,
  input: OpenAIInputItem[],
  tools: OpenAITool[],
  previousResponseId: string | null = null,
): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY não configurada" };

  let lastError = "falha na requisição";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { status, data } = await callOpenAI(apiKey, instructions, input, tools, previousResponseId);

      if (status !== 200) {
        lastError = data?.error?.message ?? `HTTP ${status}`;
        if (status === 429 && attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
          continue;
        }
        return { ok: false, error: lastError };
      }

      if (!data?.id || !data.output) {
        return { ok: false, error: "resposta da OpenAI sem conteúdo" };
      }

      return { ok: true, responseId: data.id, output: data.output };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "falha na requisição";
    }
  }

  return { ok: false, error: lastError };
}
