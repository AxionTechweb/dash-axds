"use client";

import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { requestPasswordReset, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="flex items-start gap-2 rounded-md border border-primary/40 bg-[hsl(var(--primary)/0.08)] px-3 py-2 text-left text-xs text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {state.ok}
        </p>
        <Link
          href="/login"
          className="text-xs text-muted-foreground hover:text-primary hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

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
        <Mail className="size-4" />
        {pending ? "Enviando..." : "Enviar link de redefinição"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="hover:text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
