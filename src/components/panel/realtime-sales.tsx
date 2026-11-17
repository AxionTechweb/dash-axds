"use client";

import { useEffect, useRef, useState } from "react";

import { formatCurrency } from "@/lib/format";
import type { RecentSale } from "@/lib/metrics";

/**
 * Feed "Vendas em Tempo Real" — atualiza as compras aprovadas por
 * polling a cada 15 s (rota /api/sales/latest).
 */
export function RealtimeSales({
  areaId,
  currency,
  initial,
}: {
  areaId: string;
  currency: string;
  initial: RecentSale[];
}) {
  const [sales, setSales] = useState<RecentSale[]>(initial);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Venda mais nova já exibida: o polling só busca o que chegou depois dela.
  // Sem nenhuma, começa de agora (não puxa vendas fora do período filtrado).
  const sinceRef = useRef<string>(initial[0]?.created_at ?? new Date().toISOString());

  useEffect(() => {
    let cancelled = false;

    /**
     * Polling leve na rota /api/sales/latest (sessão do painel no cookie).
     * Substitui o Supabase Realtime desde a ida pra Cloudflare (D1 não tem
     * canal de mudanças).
     */
    async function poll() {
      try {
        const since = sinceRef.current;
        const qs = new URLSearchParams({ area: areaId });
        if (since) qs.set("since", since);
        const res = await fetch(`/api/sales/latest?${qs}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { sales?: RecentSale[] };
        const fresh = Array.isArray(body.sales) ? body.sales : [];
        if (cancelled || fresh.length === 0) return;
        sinceRef.current = fresh[0].created_at;
        setSales((prev) =>
          [...fresh, ...prev.filter((s) => !fresh.some((f) => f.id === s.id))].slice(0, 12),
        );
      } catch {
        /* rede instável: tenta no próximo ciclo */
      }
    }

    pollRef.current = setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [areaId]);

  if (sales.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center p-6">
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Nenhuma venda aprovada no período. As novas aparecem aqui em tempo
          real assim que o webhook chegar.
        </p>
      </div>
    );
  }

  return (
    <ul className="max-h-96 divide-y divide-border overflow-y-auto">
      {sales.map((sale) => (
        <li
          key={sale.id}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate micro-label">
              {sale.produto ?? "Produto"}
            </p>
            <p className="font-mono text-[0.7rem] text-muted-foreground/80">
              {new Date(sale.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span className="sensitive shrink-0 font-mono text-sm font-semibold text-primary tabular">
            +{formatCurrency(Number(sale.valor) || 0, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}
