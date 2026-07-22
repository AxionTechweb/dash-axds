import { timingSafeEqual } from "node:crypto";

/**
 * Helpers PUROS de parsing dos webhooks (sem acesso a banco), separados para
 * poderem ser testados isoladamente.
 */

/** Leitura segura de caminho aninhado ("data.purchase.transaction"). */
export function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Primeiro caminho que devolver algo útil. Os payloads das plataformas variam
 * entre versões, então cada campo é buscado em vários caminhos candidatos.
 */
export function firstString(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = get(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

export function firstNumber(obj: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = get(obj, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * ad_id só é aceito se for NUMÉRICO (é o {{ad.id}} da Meta). Qualquer outra
 * coisa no `src`/`utm_content` (ex.: nome de campanha) é descartada.
 */
export function validAdId(value: string | null): string | null {
  if (!value) return null;
  return /^\d{5,25}$/.test(value) ? value : null;
}

/**
 * País só é aceito em ISO alpha-2 — o mesmo formato que a Vercel entrega em
 * `x-vercel-ip-country`. Guardar "Brasil"/"Brazil" misturado com "BR" quebraria
 * o agrupamento e o rótulo da tela de regiões, então preferimos gravar nulo.
 */
export function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Comparação em tempo constante (tokens e assinaturas). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
