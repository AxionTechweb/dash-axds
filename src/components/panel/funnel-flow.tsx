import { formatNumber } from "@/lib/format";

/**
 * Cliques no anúncio (Meta) → Page View → Checkout Iniciado → Compra.
 * Os dois do meio só têm dado real com o snippet de captura opcional ligado
 * (ver getFunnelBase); sem ele ficam em zero, o que é esperado.
 */
export function FunnelFlow({
  clicks,
  views,
  checkouts,
  purchases,
}: {
  clicks: number;
  views: number;
  checkouts: number;
  purchases: number;
}) {
  const stages = [
    { label: "Cliques no Link", value: clicks },
    { label: "Page View", value: views },
    { label: "Checkout Iniciado", value: checkouts },
    { label: "Compra", value: purchases },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      {stages.map((stage) => (
        <div
          key={stage.label}
          className="rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-4 py-5 text-center"
        >
          <span className="stat-value block text-2xl">{formatNumber(stage.value)}</span>
          <span className="micro-label mt-1 block text-muted-foreground">
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}
