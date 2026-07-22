"use client";

import { AlertCircle, LogIn } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signIn,
    {},
  );

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
        <Label htmlFor="password">Senha</Label>
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
        disabled={pending}
        className="w-full justify-center"
      >
        <LogIn className="size-4" />
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
