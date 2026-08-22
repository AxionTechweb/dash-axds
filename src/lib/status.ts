import "server-only";

/**
 * Status de serviços externos dos quais o painel depende (Configurações).
 *
 * Cloudflare tem API pública documentada (Statuspage.io). A Meta
 * (metastatus.com) NÃO tem — é uma SPA que busca os dados de um backend
 * interno sem endpoint público estável (verificado: bundle JS, RSS, paths
 * comuns, nada responde JSON) — por isso só linkamos pro site deles, sem
 * fingir ter o dado ao vivo.
 */

export type CloudflareStatus = {
  indicator: "none" | "minor" | "major" | "critical" | string;
  description: string;
} | null;

export async function getCloudflareStatus(): Promise<CloudflareStatus> {
  try {
    const res = await fetch("https://www.cloudflarestatus.com/api/v2/status.json", {
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status?: { indicator?: string; description?: string };
    };
    if (!data.status) return null;

    return {
      indicator: data.status.indicator ?? "unknown",
      description: data.status.description ?? "Status indisponível",
    };
  } catch {
    return null;
  }
}
