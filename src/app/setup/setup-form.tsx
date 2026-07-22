"use client";

import { AlertCircle, Rocket } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { runSetup, type SetupState } from "./actions";

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    runSetup,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="token">SETUP_TOKEN</Label>
        <Input
          id="token"
          name="token"
          type="password"
          required
          placeholder="Token definido no seu ambiente"
        />
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          O mesmo valor da variável <code className="font-mono">SETUP_TOKEN</code>.
        </p>
      </div>

      <hr className="border-border" />

      <div>
        <Label htmlFor="email">E-mail do administrador</Label>
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
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <div>
        <Label htmlFor="areaName">Nome da primeira área</Label>
        <Input
          id="areaName"
          name="areaName"
          required
          placeholder="Ex.: Principal"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full justify-center"
      >
        <Rocket className="size-4" />
        {pending ? "Configurando..." : "Concluir setup"}
      </Button>
    </form>
  );
}
