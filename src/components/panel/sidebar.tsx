"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/(panel)/actions";
import { Brand } from "@/components/brand";
import type { Area } from "@/lib/areas";
import type { Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

import { AreaSwitcher } from "./area-switcher";
import { NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";

type SidebarProps = {
  branding: Branding;
  areas: Area[];
  activeArea: Area | null;
  userEmail: string;
};

/** Conteúdo da sidebar, reaproveitado no desktop e no drawer mobile. */
function SidebarContent({
  branding,
  areas,
  activeArea,
  userEmail,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-1 pt-1">
        <Brand branding={branding} imgClassName="h-7 w-auto" />
      </div>

      <AreaSwitcher areas={areas} activeArea={activeArea} />

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[hsl(var(--primary)/0.12)] font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={userEmail}
          >
            {userEmail}
          </span>
          <ThemeToggle />
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

/** Sidebar fixa (desktop). */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-[hsl(var(--card)/0.6)] backdrop-blur-xl lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}

/** Drawer da navegação no mobile (o gatilho fica no header). */
export function MobileNav(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir navegação"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="size-4" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card shadow-2xl lg:hidden">
          <Dialog.Title className="sr-only">Navegação</Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Fechar navegação"
              className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>
          <SidebarContent {...props} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
