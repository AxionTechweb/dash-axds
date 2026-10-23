"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Instalação do PWA (mesmo desenho do whatsapp-lead-hub).
 *
 * Chrome/Edge/Android disparam `beforeinstallprompt` uma vez só e cedo —
 * guardamos fora do componente para não perder. No iPhone/Safari não existe
 * prompt: o botão abre o passo a passo (Compartilhar → Adicionar à Tela de
 * Início). Some quando o painel já está aberto como app.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstallAppButton() {
  // Lido só no cliente: no servidor o botão nasce escondido (sem flash).
  const installed = useSyncExternalStore(subscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(subscribe, isIos, () => false);
  const [help, setHelp] = useState(false);

  // Registra o service worker (só guarda os ícones — ver public/sw.js).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sem SW o painel funciona normal; só não fica instalável em alguns navegadores.
      });
    }
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (!deferredPrompt) {
      setHelp(true);
      return;
    }
    const evt = deferredPrompt;
    deferredPrompt = null;
    await evt.prompt();
    await evt.userChoice;
    notify();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label="Instalar app"
        title="Instalar app"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Download className="size-4" />
      </button>

      {help ? (
        <div
          role="dialog"
          aria-label="Como instalar o app"
          className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-border bg-card p-4 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-medium">Instalar o painel como app</p>
            <button
              type="button"
              onClick={() => setHelp(false)}
              aria-label="Fechar"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {ios ? (
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Abra o painel no Safari.</li>
              <li>Toque em Compartilhar (quadrado com seta para cima).</li>
              <li>Escolha &quot;Adicionar à Tela de Início&quot;.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Abra o painel no Chrome ou Edge.</li>
              <li>No menu (⋮), escolha &quot;Instalar app&quot; ou &quot;Adicionar à tela inicial&quot;.</li>
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
