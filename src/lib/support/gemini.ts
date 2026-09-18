import "server-only";

/**
 * Client fino pro Gemini — fetch direto, sem SDK, mesmo espírito do resto do
 * projeto (Meta/VTurb/Umbler). Nunca lança.
 *
 * Validado ao vivo antes de implementar: `gemini-2.5-flash` está descontinuado
 * pra chaves novas (a API devolve 404 recomendando `gemini-3.6-flash`); pra
 * devolver o resultado de uma ferramenta, o novo item de `contents` precisa
 * ter `role: "user"` — `role: "function"` é rejeitado com 400.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-3.6-flash";

export type GeminiTool = {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
};

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown>; id?: string } }
  | { functionResponse: { name: string; id?: string; response: Record<string, unknown> } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export function isFunctionCallPart(
  part: GeminiPart,
): part is { functionCall: { name: string; args: Record<string, unknown>; id?: string } } {
  return "functionCall" in part;
}

export function isTextPart(part: GeminiPart): part is { text: string } {
  return "text" in part;
}

export type GeminiResult =
  | { ok: true; content: GeminiContent }
  | { ok: false; error: string };

export async function generateContent(
  systemInstruction: string,
  contents: GeminiContent[],
  tools: GeminiTool[],
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY não configurada" };

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
        }),
        cache: "no-store",
      },
    );

    const data = (await response.json().catch(() => null)) as {
      candidates?: { content?: GeminiContent }[];
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      return { ok: false, error: data?.error?.message ?? `HTTP ${response.status}` };
    }

    const content = data?.candidates?.[0]?.content;
    if (!content) return { ok: false, error: "resposta do Gemini sem conteúdo" };

    return { ok: true, content };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}
