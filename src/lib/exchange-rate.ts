import "server-only";

/**
 * Câmbio USD→BRL — validado contra a API real (br.dolarapi.com, dado de
 * mercado via Investing.com, sem autenticação):
 *   GET https://br.dolarapi.com/v1/cotacoes/usd
 *   → {"moeda":"USD","nome":"Dólar","compra":5.1635,"venda":5.1641,
 *      "fechoAnterior":5.15,"dataAtualizacao":"2026-08-26T21:59:59.000Z"}
 *
 * Usamos `venda` (o que custa COMPRAR dólar pagando em real) — é o lado
 * relevante pra converter um gasto em dólar (Meta Ads) pro custo real em BRL.
 *
 * Cacheado por 1h: câmbio não precisa de frescor por segundo, e evita bater
 * na API externa a cada carregamento do dashboard.
 */

const DOLAR_API_URL = "https://br.dolarapi.com/v1/cotacoes/usd";
const CACHE_SECONDS = 3600;

export type UsdToBrlRate = { usdToBrl: number; updatedAt: string };

export async function getUsdToBrlRate(): Promise<UsdToBrlRate | null> {
  try {
    const response = await fetch(DOLAR_API_URL, {
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      venda?: number;
      dataAtualizacao?: string;
    };

    if (!data.venda || !Number.isFinite(data.venda) || data.venda <= 0) return null;

    return { usdToBrl: data.venda, updatedAt: data.dataAtualizacao ?? "" };
  } catch {
    return null;
  }
}
