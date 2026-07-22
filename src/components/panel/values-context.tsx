"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

/**
 * Botão "ocultar valores" (olho) do header. Quando ativo, aplica a classe
 * `values-hidden` num ancestral e o CSS borra tudo que tiver a classe
 * `sensitive`.
 *
 * O estado vive no localStorage e é lido via useSyncExternalStore — seguro com
 * SSR (getServerSnapshot) e sem setState dentro de effect.
 */
const STORAGE_KEY = "valuesHidden";

let listeners: (() => void)[] = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** No servidor os valores começam sempre visíveis. */
function getServerSnapshot(): boolean {
  return false;
}

function setHidden(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignora
  }
  listeners.forEach((l) => l());
}

type ValuesContextType = { hidden: boolean; toggle: () => void };

const ValuesContext = createContext<ValuesContextType>({
  hidden: false,
  toggle: () => {},
});

export const useValues = () => useContext(ValuesContext);

export function ValuesProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggle = useCallback(() => setHidden(!getSnapshot()), []);

  return (
    <ValuesContext.Provider value={{ hidden, toggle }}>
      <div className={hidden ? "values-hidden contents" : "contents"}>
        {children}
      </div>
    </ValuesContext.Provider>
  );
}
