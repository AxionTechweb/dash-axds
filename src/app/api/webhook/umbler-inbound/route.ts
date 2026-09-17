import { json } from "@/lib/capture";

/**
 * Recebe eventos da Umbler Talk (registrados via `registerUmblerWebhook`).
 *
 * STUB da Fase 1c: só loga o payload cru pra confirmar o formato real do
 * evento "Message" antes de escrever o parser de verdade (autenticação,
 * identificação de contato, chamada ao orquestrador) — nunca chutar o
 * formato de um payload que ainda não vimos.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  console.log("[umbler-inbound] payload recebido:", body);
  return json({ ok: true }, 200);
}
