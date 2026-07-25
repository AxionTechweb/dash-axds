import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const branding = await getBranding();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Glow ambiente atrás do cartão — assinatura da referência. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--primary)/0.07)] blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Brand branding={branding} imgClassName="h-9 w-auto" />
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--foreground)/0.04)] px-3 py-1">
            <span className="status-dot" />
            <span className="micro-label">Acesso restrito</span>
          </div>
        </div>

        <div className="glass p-6">
          <LoginForm />
        </div>

        {/* Linha decorativa que some nas pontas */}
        <div className="hairline-fade mx-auto mt-8 w-2/3" />

        <p className="micro-label mt-4 text-center">
          Cadastro público desativado
        </p>
      </div>
    </main>
  );
}
