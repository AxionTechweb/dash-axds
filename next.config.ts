import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
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
