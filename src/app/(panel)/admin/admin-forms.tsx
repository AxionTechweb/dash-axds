"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { inviteUser, removeUser, type AdminState } from "./actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(
    inviteUser,
    {},
  );

  return (
    <form action={formAction} className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="invite-email"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Convidar por e-mail
          </label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="pessoa@exemplo.com"
          />
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          <UserPlus className="size-3.5" />
          {pending ? "Enviando..." : "Enviar convite"}
        </Button>
      </div>

      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
      {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}

      <p className="text-[0.7rem] text-muted-foreground">
        O cadastro público permanece desligado — o acesso só acontece por
        convite.
      </p>
    </form>
  );
}

export function RemoveUserButton({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(
    removeUser,
    {},
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending || isSelf}
        title={isSelf ? "Você não pode remover a própria conta" : "Remover"}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </form>
  );
}
