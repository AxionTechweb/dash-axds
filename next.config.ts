import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Upload da imagem do anúncio (/campanhas/nova); a Vercel corta em ~4,5 MB.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
