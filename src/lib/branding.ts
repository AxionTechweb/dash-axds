import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Branding é GLOBAL da instância (linha única na tabela `branding`).
 * Defaults NEUTROS — nenhum nome de marca fixo no repositório (white label).
 * Lido com service_role porque a tela de login (pré-autenticação) também precisa.
 */
export type Branding = {
  product_name: string;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color_override: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  product_name: "Axion",
  logo_light_url: "/brand/logo.png",
  logo_dark_url: "/brand/logo.png",
  favicon_url: "/brand/logo.png",
  primary_color_override: null,
};

/** Lê o branding da instância. Nunca lança: cai nos defaults neutros. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("branding")
      .select(
        "product_name, logo_light_url, logo_dark_url, favicon_url, primary_color_override",
      )
      .eq("id", true)
      .maybeSingle();

    if (error || !data) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...data };
  } catch {
    // Env ainda não configurado (ex.: build sem Supabase) — usa defaults.
    return DEFAULT_BRANDING;
  }
});
