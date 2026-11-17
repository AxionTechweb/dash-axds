import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Cabeçalhos de segurança em todas as respostas: força HTTPS (HSTS), impede o
 * painel de ser embutido em iframe de outro site (clickjacking), bloqueia
 * "adivinhação" de tipo de arquivo e não vaza a URL completa pra outros sites.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Upload da imagem do anúncio (/campanhas/nova); a Vercel corta em ~4,5 MB.
    serverActions: { bodySizeLimit: "5mb" },
    // Desde o Next 15 o cache do router no CLIENTE (staleTime) é 0 por
    // padrão pra rotas dinâmicas — ou seja, toda navegação (inclusive
    // clicar de volta numa aba visitada há poucos segundos) refaz TODAS as
    // buscas do zero, inclusive o layout do painel inteiro (que roda em
    // toda navegação). Com 30s aqui, voltar pra uma aba já visitada
    // recentemente reaproveita o que já foi buscado em vez de esperar de
    // novo — o botão "Atualizar" do header já existe pra quem quiser forçar
    // dado fresco antes dos 30s.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;

// Dá acesso aos bindings da Cloudflare (getCloudflareContext) no `next dev`.
initOpenNextCloudflareForDev();
