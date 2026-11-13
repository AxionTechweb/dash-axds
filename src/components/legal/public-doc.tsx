import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import type { Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

/**
 * Casca das páginas públicas de texto (/docs, /privacidade): cabeçalho com a
 * marca, sumário lateral no desktop e tipografia de leitura. Sem login.
 */

export type TocItem = { id: string; label: string };

export function PublicDoc({
  branding,
  eyebrow,
  title,
  intro,
  toc,
  children,
}: {
  branding: Branding;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/docs" aria-label={branding.product_name}>
            <Brand branding={branding} imgClassName="h-6 w-auto" />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">
              Documentação
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-border px-3 py-1 text-foreground hover:bg-[hsl(var(--foreground)/0.04)]"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            <p className="micro-label mb-3">Nesta página</p>
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-[hsl(var(--foreground)/0.04)] hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 max-w-3xl">
          <p className="micro-label">{eyebrow}</p>
          <h1 className="display-title mt-3 text-4xl text-foreground md:text-5xl">{title}</h1>
          <div className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{intro}</div>
          <div className="mt-10 space-y-12">{children}</div>
          <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {branding.product_name} ·{" "}
            <Link href="/docs" className="hover:text-foreground">
              Documentação
            </Link>{" "}
            ·{" "}
            <Link href="/privacidade" className="hover:text-foreground">
              Política de Privacidade
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-20 pt-2 text-lg font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function List({ children, ordered }: { children: ReactNode; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-primary",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {children}
    </Tag>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[hsl(var(--foreground)/0.06)] px-1.5 py-0.5 font-code text-[13px] text-foreground">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-[hsl(var(--foreground)/0.03)] p-4 font-code text-[13px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-4 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-[hsl(var(--foreground)/0.03)]">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 align-top text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
