"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Branding } from "@/lib/branding";

import { saveBranding, type BrandingState } from "./branding-actions";

export function BrandingForm({ branding }: { branding: Branding }) {
  const [state, formAction, pending] = useActionState<BrandingState, FormData>(
    saveBranding,
    {},
  );

  return (
    <form action={formAction} className="space-y-4 p-4">
      <div>
        <Label htmlFor="product_name">Nome do produto</Label>
        <Input
          id="product_name"
          name="product_name"
          required
          maxLength={60}
          defaultValue={branding.product_name}
        />
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Usado no título das páginas, na sidebar e na tela de login.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="logo_dark_url">Logo (tema escuro)</Label>
          <Input
            id="logo_dark_url"
            name="logo_dark_url"
            defaultValue={branding.logo_dark_url ?? ""}
            placeholder="https://... ou /logo-dark.svg"
          />
        </div>
        <div>
          <Label htmlFor="logo_light_url">Logo (tema claro)</Label>
          <Input
            id="logo_light_url"
            name="logo_light_url"
            defaultValue={branding.logo_light_url ?? ""}
            placeholder="https://... ou /logo-light.svg"
          />
        </div>
        <div>
          <Label htmlFor="favicon_url">Favicon</Label>
          <Input
            id="favicon_url"
            name="favicon_url"
            defaultValue={branding.favicon_url ?? ""}
            placeholder="https://... ou /favicon.ico"
          />
        </div>
        <div>
          <Label htmlFor="primary_color_override">
            Cor primária (opcional)
          </Label>
          <Input
            id="primary_color_override"
            name="primary_color_override"
            defaultValue={branding.primary_color_override ?? ""}
            placeholder="142 76% 58%"
          />
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            HSL sem a função. Vazio mantém o verde-neon padrão.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
          {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar branding"}
        </Button>
      </div>
    </form>
  );
}
