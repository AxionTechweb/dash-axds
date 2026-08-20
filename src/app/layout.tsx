import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Oswald, Plus_Jakarta_Sans } from "next/font/google";

import { getBranding } from "@/lib/branding";

import "./globals.css";

/** Corpo do texto — a fonte do design de referência. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

/** Títulos display: caixa-alta, condensada, bem apertada. */
const oswald = Oswald({
  variable: "--font-oswald",
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

/** Cor da barra de status/moldura do navegador ao instalar — mesmo tom do tema escuro padrão. */
export const viewport: Viewport = {
  themeColor: "#030303",
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
      className={`${jakarta.variable} ${oswald.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
