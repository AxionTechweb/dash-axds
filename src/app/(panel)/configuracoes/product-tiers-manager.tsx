"use client";

import { useActionState, useRef } from "react";

import { saveProductTier } from "@/app/(panel)/integracoes/actions";
import type { FormState } from "@/app/(panel)/integracoes/actions";

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "outro", label: "Outro" },
  { value: "vd", label: "VD" },
  { value: "upsell", label: "Upsell" },
  { value: "downsell", label: "Downsell" },
];

function ProductRow({ produto, tier }: { produto: string; tier: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveProductTier, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <li className="list-tile flex items-center gap-3 p-3">
      <form ref={formRef} action={action} className="flex flex-1 items-center gap-3">
        <input type="hidden" name="produto" value={produto} />
        <p className="min-w-0 flex-1 truncate text-sm tracking-tight">{produto}</p>
        <select
          name="tier"
          defaultValue={tier}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-9 shrink-0 rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] px-2.5 text-xs outline-none focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {TIER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </form>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </li>
  );
}

export function ProductTiersManager({
  products,
}: {
  products: { produto: string; tier: string }[];
}) {
  return (
    <ul className="max-h-96 space-y-1 overflow-y-auto">
      {products.map((p) => (
        <ProductRow key={p.produto} produto={p.produto} tier={p.tier} />
      ))}
    </ul>
  );
}
