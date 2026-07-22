"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatCurrency } from "@/lib/format";
import type { RecentSale } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/client";

/**
 * Feed "Vendas em Tempo Real" — recebe as compras aprovadas via Supabase
 * Realtime assim que o webhook grava. Se o Realtime não conectar, cai num
 * polling leve (router.refresh) como fallback.
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
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`purchases:${areaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "purchases",
          filter: `area_id=eq.${areaId}`,
        },
        (payload) => {
          const row = payload.new as RecentSale & { status?: string };
          if (row.status !== "approved") return;

          setSales((prev) =>
            [
              {
                id: row.id,
                produto: row.produto,
                valor: row.valor,
                created_at: row.created_at,
              },
              ...prev.filter((s) => s.id !== row.id),
            ].slice(0, 12),
          );
        },
      )
      .subscribe((status) => {
        // Fallback: sem Realtime, atualiza a rota periodicamente.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          pollRef.current ??= setInterval(() => router.refresh(), 60_000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [areaId, router]);

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
            <p className="truncate text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
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
