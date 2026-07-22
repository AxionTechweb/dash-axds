"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";

import { deleteArea, renameArea, type AreaState } from "@/app/(panel)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Area } from "@/lib/areas";

export function AreasManager({
  areas,
  activeAreaId,
}: {
  areas: Area[];
  activeAreaId: string | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {areas.map((area) => (
        <AreaRow
          key={area.id}
          area={area}
          isActive={area.id === activeAreaId}
          canDelete={areas.length > 1}
        />
      ))}
    </ul>
  );
}

function AreaRow({
  area,
  isActive,
  canDelete,
}: {
  area: Area;
  isActive: boolean;
  canDelete: boolean;
}) {
  const [renameState, renameAction, renaming] = useActionState<
    AreaState,
    FormData
  >(renameArea, {});

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <form action={renameAction} className="flex min-w-0 flex-1 items-center gap-2">
        <input type="hidden" name="areaId" value={area.id} />
        <Input
          name="nome"
          defaultValue={area.nome}
          aria-label={`Nome da área ${area.nome}`}
          className="h-9 max-w-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={renaming}>
          <Check className="size-3.5" />
          {renaming ? "Salvando" : "Salvar"}
        </Button>
        {isActive ? (
          <span className="rounded-full border border-primary/40 bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[0.65rem] font-medium text-primary">
            ativa
          </span>
        ) : null}
      </form>

      <DeleteAreaButton area={area} canDelete={canDelete} />

      {renameState.error ? (
        <p className="w-full text-xs text-destructive">{renameState.error}</p>
      ) : null}
    </li>
  );
}

function DeleteAreaButton({
  area,
  canDelete,
}: {
  area: Area;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AreaState, FormData>(
    deleteArea,
    {},
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canDelete}
          title={
            canDelete
              ? "Excluir área"
              : "Não é possível excluir a única área da instância"
          }
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Excluir
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-destructive">
            <TriangleAlert className="size-4" />
            Excluir “{area.nome}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Isso remove em cascata <strong>todos</strong> os visitantes, eventos,
            compras, regras e integrações desta área. A ação não pode ser
            desfeita.
          </Dialog.Description>

          {state.error ? (
            <p className="mt-3 text-xs text-destructive">{state.error}</p>
          ) : null}

          <form
            action={(fd) => {
              formAction(fd);
              setOpen(false);
            }}
            className="mt-5 flex justify-end gap-2"
          >
            <input type="hidden" name="areaId" value={area.id} />
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancelar
              </Button>
            </Dialog.Close>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending ? "Excluindo..." : "Excluir área"}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
