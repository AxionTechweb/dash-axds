"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Preferência de colunas da tabela de /campanhas — compartilhada entre a
 * tabela normal e as 3 tabelas do modo drill-down (campanha/conjunto/
 * anúncio), por isso vive fora de qualquer componente específico: mesmo
 * padrão de src/components/panel/values-context.tsx (useSyncExternalStore +
 * localStorage + listeners em módulo), sem precisar de Provider porque não
 * há nó visual pra envolver.
 *
 * Guarda DOIS pedaços: a ORDEM completa (todas as métricas do catálogo,
 * visíveis ou não — é o que o modal "Personalizar" lista e deixa arrastar) e
 * quais estão OCULTAS (um subconjunto da ordem). A tabela só usa a ordem
 * menos as ocultas.
 */

const STORAGE_KEY = "campanhas:colunas:v2";

type StoredPrefs = { order: string[]; hidden: string[] };

let listeners: (() => void)[] = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function readStored(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return { order: parsed.order, hidden: parsed.hidden };
  } catch {
    return null;
  }
}

/** No servidor (e enquanto não há preferência salva) usa o default do chamador. */
function getServerSnapshot(): StoredPrefs | null {
  return null;
}

function writeStored(prefs: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignora — preferência de UI, não é crítico persistir
  }
  listeners.forEach((l) => l());
}

export function useColumnPreferences(
  allIds: string[],
  defaultHiddenIds: string[],
): {
  /** Todas as métricas do catálogo, na ordem de exibição (visíveis + ocultas). */
  fullOrder: string[];
  hiddenIds: Set<string>;
  /** Só as visíveis, já na ordem — o que a tabela de verdade renderiza. */
  activeColumnIds: string[];
  setPrefs: (order: string[], hidden: string[]) => void;
  resetToDefault: () => void;
} {
  const stored = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const fullOrder = useMemo(() => {
    const base = stored?.order ?? allIds;
    // Métrica nova no catálogo que ainda não está na ordem salva entra no fim
    // — sem isso, uma métrica adicionada depois nunca apareceria pra quem já
    // tinha uma preferência salva.
    const missing = allIds.filter((id) => !base.includes(id));
    return [...base.filter((id) => allIds.includes(id)), ...missing];
  }, [stored, allIds]);

  const hiddenIds = useMemo(
    () => new Set(stored?.hidden ?? defaultHiddenIds),
    [stored, defaultHiddenIds],
  );

  const activeColumnIds = useMemo(
    () => fullOrder.filter((id) => !hiddenIds.has(id)),
    [fullOrder, hiddenIds],
  );

  const setPrefs = useCallback(
    (order: string[], hidden: string[]) => writeStored({ order, hidden }),
    [],
  );

  const resetToDefault = useCallback(
    () => writeStored({ order: allIds, hidden: defaultHiddenIds }),
    [allIds, defaultHiddenIds],
  );

  return { fullOrder, hiddenIds, activeColumnIds, setPrefs, resetToDefault };
}
