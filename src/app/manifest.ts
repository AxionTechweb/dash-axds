import type { MetadataRoute } from "next";

import { getBranding } from "@/lib/branding";

/**
 * Manifest do PWA — gerado dinamicamente a partir do branding da instância
 * (white label: nome e ícone variam por cliente, nunca fixos no repo).
 * Só "instalável" (Adicionar à tela inicial): sem service worker/cache
 * offline de propósito — é um painel de dados ao vivo, mostrar números
 * desatualizados sem o usuário perceber que está offline seria pior que não
 * funcionar offline.
 */
function guessImageMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ico":
      return "image/x-icon";
    default:
      return "image/png";
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding();

  return {
    name: branding.product_name,
    short_name: branding.product_name,
    description: "Painel de tracking e atribuição de anúncios.",
    start_url: "/",
    display: "standalone",
    // Mesmo tom do tema escuro padrão (--background: 0 0% 1%) — a tela de
    // splash/instalação não pisca claro antes do app carregar.
    background_color: "#030303",
    theme_color: "#030303",
    icons: branding.favicon_url
      ? [
          {
            // Reaproveita o favicon já configurado no branding da instância —
            // sem garantia de ser 512×512, então "any" em vez de inventar um
            // tamanho que a imagem pode não ter de verdade.
            src: branding.favicon_url,
            sizes: "any",
            type: guessImageMime(branding.favicon_url),
          },
        ]
      : [],
  };
}
