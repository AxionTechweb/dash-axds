"use client";

import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useValues } from "./values-context";

/** Botão "ocultar valores" (olho) — borra tudo que estiver marcado como sensível. */
export function HideValuesButton() {
  const { hidden, toggle } = useValues();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}

/** Recarrega os dados dos Server Components da rota atual. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label="Atualizar"
      title="Atualizar"
      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
