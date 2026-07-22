import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";

import { hasAnyUser } from "./actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Setup" };

// Sempre avaliar no request: o estado do setup muda com o primeiro usuário.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const branding = await getBranding();

  let done = false;
  let envError: string | null = null;

  try {
    done = await hasAnyUser();
  } catch (err) {
    envError =
      err instanceof Error ? err.message : "Falha ao conectar no Supabase.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Brand branding={branding} imgClassName="h-9 w-auto" />
          <p className="text-sm text-muted-foreground">
            Configuração de primeira execução.
          </p>
        </div>

        <div className="glass p-6">
          {envError ? (
            <div className="space-y-3 text-sm">
              <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Não foi possível falar com o Supabase.
              </p>
              <p className="text-muted-foreground">
                Confira as variáveis de ambiente do{" "}
                <code className="font-mono text-xs">.env.local</code> e se as
                migrations foram aplicadas:
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.7rem] text-muted-foreground">
{`npx supabase link --project-ref SEU_REF
npx supabase db push`}
              </pre>
              <p className="font-mono text-[0.7rem] text-muted-foreground">
                {envError}
              </p>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-9 text-primary" />
              <div className="space-y-1">
                <p className="font-semibold">Setup já concluído</p>
                <p className="text-sm text-muted-foreground">
                  Esta rota está desativada porque já existe um usuário.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Ir para o login →
              </Link>
            </div>
          ) : (
            <SetupForm />
          )}
        </div>

        <p className="mt-5 text-center text-[0.7rem] text-muted-foreground">
          Cria o primeiro administrador e a primeira área. Depois disso, a rota
          se desativa automaticamente.
        </p>
      </div>
    </main>
  );
}
