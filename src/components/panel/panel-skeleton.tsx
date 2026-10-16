/**
 * Esqueleto genérico pros `loading.tsx` de cada aba do painel — aparece
 * INSTANTANEAMENTE na navegação (Suspense automático do App Router),
 * enquanto a página de verdade ainda está buscando dado nas APIs externas
 * (Meta/Vturb/Umbler), que são o que realmente demora. Sem isso a tela
 * ficava congelada/em branco até a página inteira terminar de carregar —
 * essa troca sozinha já resolve boa parte da sensação de lentidão, mesmo
 * sem mudar nenhuma chamada de API.
 *
 * Propositalmente genérico (grade de cards + um bloco maior) em vez de
 * tentar imitar o layout exato de cada aba — o objetivo é dar feedback
 * visual imediato, não pixel-perfect.
 */
function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg border border-border bg-[hsl(var(--foreground)/0.04)] ${className}`}
    />
  );
}

export function PanelSkeleton({ kpis = 6 }: { kpis?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Block className="h-6 w-40" />
        <Block className="h-4 w-56" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: kpis }).map((_, i) => (
          <Block key={i} className="h-28" />
        ))}
      </div>

      <Block className="h-72" />
    </div>
  );
}
