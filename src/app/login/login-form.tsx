"use client";

import { AlertCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signIn,
    {},
  );

  // Login ok → navegação completa (o cookie de sessão acabou de ser gravado).
  // No Worker (OpenNext) o redirect() de dentro da action quebrava depois de
  // gravar o cookie; a navegação pelo navegador é o caminho robusto.
  useEffect(() => {
    if (state.ok) window.location.assign("/dashboard");
  }, [state.ok]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">Senha</Label>
          <Link
            href="/esqueci-senha"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={pending || !!state.ok}
        className="w-full justify-center"
      >
        <LogIn className="size-4" />
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
