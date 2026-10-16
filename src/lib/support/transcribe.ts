import "server-only";

/**
 * Transcrição de áudio (notas de voz do WhatsApp) via `/v1/audio/transcriptions`
 * da OpenAI, modelo `gpt-transcribe` (o recomendado atualmente — substituiu o
 * gpt-4o-transcribe). Diferente do resto do client da OpenAI (Responses API,
 * JSON), esse endpoint exige multipart/form-data — não aceita base64 inline.
 */

const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const TRANSCRIBE_MODEL = "gpt-transcribe";

// Mesmo problema já visto no download do arquivo (route.ts): falha
// transitória de rede/disponibilidade bem na hora do webhook, URL
// funcionando normal minutos depois — sem retry, isso escalonava pra humano
// à toa.
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 800;

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Extensão a partir do content-type — a OpenAI usa o nome do arquivo pra inferir o formato. */
function extensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };
  return map[mimeType.toLowerCase()] ?? "ogg";
}

export async function transcribeAudio(
  audioUrl: string,
  mimeType: string,
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY não configurada" };

  let audioBuffer: ArrayBuffer | null = null;
  let lastDownloadError = "falha ao baixar áudio";
  for (let attempt = 0; attempt < DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        lastDownloadError = `falha ao baixar áudio: HTTP ${audioRes.status}`;
      } else {
        audioBuffer = await audioRes.arrayBuffer();
        break;
      }
    } catch (err) {
      lastDownloadError =
        err instanceof Error ? `falha ao baixar áudio: ${err.message}` : "falha ao baixar áudio";
    }

    if (attempt < DOWNLOAD_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, DOWNLOAD_RETRY_DELAY_MS));
    }
  }

  if (audioBuffer === null) return { ok: false, error: lastDownloadError };

  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([audioBuffer], { type: mimeType }),
      `audio.${extensionFromMimeType(mimeType)}`,
    );
    form.append("model", TRANSCRIBE_MODEL);

    const response = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = (await response.json().catch(() => null)) as {
      text?: string;
      error?: { message?: string };
    } | null;

    if (response.status !== 200) {
      return { ok: false, error: data?.error?.message ?? `HTTP ${response.status}` };
    }

    const text = data?.text?.trim() ?? "";
    if (!text) return { ok: false, error: "transcrição vazia" };

    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha na requisição" };
  }
}
