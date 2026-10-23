"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Tela de carregamento da Axion ao trocar de aba no painel (adaptada do
 * ZamLoader do portal-guardian-wing): fundo preto, logo pulsando em dourado e
 * spinner dourado.
 *
 * Diferente do portal, não há espera fixa: aparece no clique de um link
 * interno e some assim que a rota nova renderiza — com um mínimo curto para o
 * efeito não piscar, e um teto de segurança caso a navegação não aconteça.
 */
const MIN_VISIBLE_MS = 500;
const SAFETY_MS = 12_000;

export function NavLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [show, setShow] = useState(false);
  const startedAt = useRef(0);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clique em link interno que muda de rota → mostra o loader.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;

      startedAt.current = Date.now();
      setShow(true);
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setShow(false), SAFETY_MS);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Rota nova renderizou → esconde (respeitando o tempo mínimo).
  useEffect(() => {
    if (!startedAt.current) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      setShow(false);
      startedAt.current = 0;
      if (safety.current) clearTimeout(safety.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [routeKey]);

  return (
    <div className={`ax-loader${show ? " ax-loader-show" : ""}`} aria-hidden={!show} role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-trim.png" alt="" className="ax-loader-logo" />
      <span className="ax-loader-spinner" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
