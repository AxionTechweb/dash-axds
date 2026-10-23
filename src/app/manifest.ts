import type { MetadataRoute } from "next";

import { getBranding } from "@/lib/branding";

/**
 * Manifest do PWA (instalar o painel como app no celular/desktop).
 *
 * Nome vem do branding da instância; enquanto ele estiver no padrão neutro
 * ("Dashboard"), usa o nome da Axion. Ícones: os do branding se houver
 * favicon configurado, senão os de /public/icons (gerados da logo da Axion,
 * nos tamanhos que o Android/Chrome exigem para instalar).
 *
 * O service worker (public/sw.js) só guarda os ícones — nunca o código nem os
 * dados: é um painel ao vivo, número velho em cache seria pior que offline.
 */
const DEFAULT_NAME = "Axion Data Systems";
const DEFAULT_SHORT_NAME = "Axion";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding();
  const custom = branding.product_name && branding.product_name !== "Dashboard";

  return {
    name: custom ? branding.product_name : DEFAULT_NAME,
    short_name: custom ? branding.product_name : DEFAULT_SHORT_NAME,
    description: "Painel de tracking e atribuição de anúncios.",
    lang: "pt-BR",
    // Abre direto no painel; sem sessão, o proxy manda para o /login.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    icons: branding.favicon_url
      ? [{ src: branding.favicon_url, sizes: "any", purpose: "any" }]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
  };
}
