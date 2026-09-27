import type { Metadata, Viewport } from "next";
import { Anton, Cinzel, Inter, JetBrains_Mono } from "next/font/google";

import { getBranding } from "@/lib/branding";

import "./globals.css";

/** Tipografia sans moderna e ultra legível — Inter (Axion). */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Títulos display bold e condensados de impacto — Anton (identidade visual dos anúncios Axion). */
const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

/** Serifa premium de inspiração clássica — Cinzel (Axion). */
const myth = Cinzel({
  variable: "--font-myth",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

/** Rótulos micro, KPIs e tabelas (numerais tabulares). */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Título/ícone vêm do branding da instância (defaults neutros). */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: {
      default: branding.product_name,
      template: `%s · ${branding.product_name}`,
    },
    description: "Painel de tracking e atribuição de anúncios.",
    ...(branding.favicon_url
      ? { icons: { icon: branding.favicon_url, apple: branding.favicon_url } }
      : {}),
    // iOS não lê o manifest pra instalar — precisa desses meta tags próprios.
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: branding.product_name,
    },
  };
}

/** Cor da barra de status/moldura do navegador ao instalar — preto absoluto da Axion. */
export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

/**
 * Aplica o tema salvo antes da primeira pintura (evita flash).
 * O padrão é escuro; o toggle grava "light"/"dark" no localStorage.
 */
const themeScript = `
(function(){try{var t=localStorage.getItem('theme');
if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding();

  // Override opcional da cor primária pelo painel (formato HSL "142 76% 58%").
  const primaryOverride = branding.primary_color_override
    ? ({ ["--primary" as string]: branding.primary_color_override } as React.CSSProperties)
    : undefined;

  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      style={primaryOverride}
      className={`${inter.variable} ${display.variable} ${myth.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
