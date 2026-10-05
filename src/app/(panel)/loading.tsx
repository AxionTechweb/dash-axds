/**
 * Esqueleto exibido na hora em que a pessoa troca de aba, enquanto a página
 * nova busca os dados — sem isso a tela antiga fica congelada até terminar.
 */
export default function PanelLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[hsl(var(--foreground)/0.06)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--foreground)/0.05)]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-[hsl(var(--foreground)/0.05)]" />
    </div>
  );
}
