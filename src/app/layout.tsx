import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";

import { getBranding } from "@/lib/branding";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

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
    ...(branding.favicon_url ? { icons: { icon: branding.favicon_url } } : {}),
  };
}

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
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
