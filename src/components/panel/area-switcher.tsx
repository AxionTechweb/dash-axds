"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown, FolderPlus, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Area } from "@/lib/areas";

import { createArea, selectArea, type AreaState } from "@/app/(panel)/actions";

/**
 * Seletor de Área no topo da sidebar (+ Nova área).
 * A área ativa vai para um cookie e é propagada ao servidor.
 */
export function AreaSwitcher({
  areas,
  activeArea,
}: {
  areas: Area[];
  activeArea: Area | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="min-w-0">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Área
              </span>
              <span className="block truncate font-medium">
                {activeArea?.nome ?? "Nenhuma área"}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border border-border bg-card p-1 shadow-xl"
          >
            {areas.map((area) => (
              <form key={area.id} action={selectArea}>
                <input type="hidden" name="areaId" value={area.id} />
                <DropdownMenu.Item asChild>
                  <button
                    type="submit"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted data-[highlighted]:bg-muted"
                  >
                    <span className="truncate">{area.nome}</span>
                    {activeArea?.id === area.id ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </DropdownMenu.Item>
              </form>
            ))}

            {areas.length > 0 ? (
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            ) : null}

            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary outline-none hover:bg-muted data-[highlighted]:bg-muted"
              >
                <Plus className="size-4" />
                Nova área
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <NewAreaDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function NewAreaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<AreaState, FormData>(
    createArea,
    {},
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <FolderPlus className="size-4 text-primary" />
            Nova área
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Cada área tem suas próprias contas de anúncio, integrações,
            visitantes e vendas.
          </Dialog.Description>

          <form
            action={(fd) => {
              formAction(fd);
              onOpenChange(false);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <Label htmlFor="nome">Nome da área</Label>
              <Input id="nome" name="nome" required placeholder="Ex.: Principal" />
            </div>

            {state.error ? (
              <p role="alert" className="text-xs text-destructive">
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={pending}
              >
                {pending ? "Criando..." : "Criar área"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
