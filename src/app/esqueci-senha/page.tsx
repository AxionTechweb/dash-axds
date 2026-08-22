import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage() {
  const branding = await getBranding();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--primary)/0.07)] blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Brand branding={branding} imgClassName="h-9 w-auto" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Redefinir senha
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe seu e-mail e mandamos um link pra você escolher uma senha
              nova.
            </p>
          </div>
        </div>

        <div className="glass p-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
