/**
 * Versão da Analytics API da Vturb — CONSTANTE ÚNICA, mesmo espírito de
 * META_API_VERSION em src/lib/meta/config.ts.
 *
 * Doc: https://vturb.gitbook.io/analytics-api/pt
 */
export const VTURB_API_VERSION = "v1";

export const VTURB_API_BASE = "https://analytics.vturb.net";

/**
 * Rate limit CONSERVADOR — o plano Basic da Vturb permite 60 req/min; ficamos
 * bem abaixo, mesmo raciocínio do META_RATE_LIMIT.
 */
export const VTURB_RATE_LIMIT = {
  max: 20,
  windowSeconds: 60,
};

/**
 * Marca de tempo (segundos de vídeo assistidos) usada para calcular o "Hook
 * Rate" — % de sessões que ainda estavam assistindo nesse ponto. 5s é o
 * padrão do mercado de VSL para medir se o gancho inicial prendeu o viewer.
 */
export const VTURB_HOOK_THRESHOLD_SECONDS = 5;
