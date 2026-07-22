import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const branding = await getBranding();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Brand branding={branding} imgClassName="h-9 w-auto" />
          <p className="text-sm text-muted-foreground">
            Entre para acessar o painel.
          </p>
        </div>

        <div className="glass p-6">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-[0.7rem] text-muted-foreground">
          Acesso restrito · cadastro público desativado
        </p>
      </div>
    </main>
  );
}
