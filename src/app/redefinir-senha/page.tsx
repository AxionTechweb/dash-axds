import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";
import { getCurrentUser } from "@/lib/auth";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const [branding, user] = await Promise.all([getBranding(), getCurrentUser()]);

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
            <h1 className="text-base font-semibold tracking-tight">Escolha uma senha nova</h1>
            {user?.email ? (
              <p className="mt-1 text-sm text-muted-foreground">Conta: {user.email}</p>
            ) : null}
          </div>
        </div>

        <div className="glass p-6">
          {user ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                Esse link expirou ou já foi usado. Peça um novo em
                &quot;Esqueceu a senha?&quot;, na tela de login.
              </p>
              <Link
                href="/esqueci-senha"
                className="inline-block text-xs text-primary hover:underline"
              >
                Pedir novo link
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
