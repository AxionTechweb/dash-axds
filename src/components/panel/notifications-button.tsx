"use client";

import { Bell, BellOff, BellRing, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Sino do topo: ativa as notificações push neste aparelho (vendas, resumo das
 * 18h, criativo reprovado, conta bloqueada...). No iPhone só funciona com o
 * painel instalado na Tela de Início (iOS 16.4+).
 */
type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosBrowserTab(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function NotificationsButton() {
  const [state, setState] = useState<State>("loading");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const detect = async (): Promise<State> => {
      if (isIosBrowserTab()) return "ios-install";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      const sub = await currentSubscription().catch(() => null);
      return sub && Notification.permission === "granted" ? "on" : "off";
    };
    detect().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "unsupported") return null;

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const keyRes = await fetch("/api/push/key");
      if (!keyRes.ok) throw new Error("Notificações ainda não configuradas no servidor.");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!save.ok) throw new Error("Não foi possível salvar a inscrição.");

      setState("on");
      await fetch("/api/push/test", { method: "POST" });
      setMessage("Ativado! Mandei uma notificação de teste.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao ativar.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("Notificações desativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { sent?: number }) : {};
    setMessage(data.sent ? "Teste enviado." : "Nenhum aparelho recebeu — tente desativar e ativar de novo.");
    setBusy(false);
  };

  const Icon = state === "on" ? BellRing : state === "denied" ? BellOff : Bell;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificações"
        title="Notificações"
        className={`inline-flex size-9 items-center justify-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] transition-colors hover:bg-muted ${
          state === "on" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="size-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-border bg-card p-4 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-medium">Notificações no celular</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>

          {state === "ios-install" ? (
            <p className="text-muted-foreground">
              No iPhone, primeiro instale o painel: Compartilhar → &quot;Adicionar à Tela de Início&quot;. Depois abra pelo
              ícone e ative aqui.
            </p>
          ) : state === "denied" ? (
            <p className="text-muted-foreground">
              As notificações estão bloqueadas para este site. Libere nas configurações do navegador/celular e volte aqui.
            </p>
          ) : (
            <>
              <p className="mb-3 text-muted-foreground">
                {state === "on"
                  ? "Ativas neste aparelho: vendas, resumo das 18h, criativo reprovado, conta bloqueada e outros avisos."
                  : "Receba vendas, o resumo das 18h e os avisos importantes na barra do celular, com som."}
              </p>
              <div className="flex flex-wrap gap-2">
                {state === "on" ? (
                  <>
                    <button
                      type="button"
                      onClick={test}
                      disabled={busy}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                    >
                      Enviar teste
                    </button>
                    <button
                      type="button"
                      onClick={disable}
                      disabled={busy}
                      className="rounded-md px-3 py-1.5 text-xs text-destructive hover:bg-[hsl(var(--destructive)/0.1)] disabled:opacity-60"
                    >
                      Desativar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={enable}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
                    Ativar notificações
                  </button>
                )}
              </div>
            </>
          )}
          {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
