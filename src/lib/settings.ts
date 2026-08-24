import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Settings da área (uma linha por área).
 * ATENÇÃO: nunca selecionar aqui as colunas de segredo (hotmart_hottok,
 * kiwify_webhook_token) — elas só são lidas/decifradas no servidor, nas rotas
 * que realmente precisam (Fase 4/7).
 */
export type Settings = {
  area_id: string;
  currency: string;
  tax_rate: number;
  revenue_goal: number;
  allowed_origins: string[];
  /** Taxa do gateway de pagamento (ex.: PayT) sobre o faturamento — % por venda. */
  gateway_fee_pct: number;
  /** Taxa fixa do gateway de pagamento, por venda. */
  gateway_fee_fixed: number;
};

export const DEFAULT_SETTINGS: Omit<Settings, "area_id"> = {
  currency: "BRL",
  tax_rate: 0,
  revenue_goal: 0,
  allowed_origins: [],
  gateway_fee_pct: 0,
  gateway_fee_fixed: 0,
};

export const getSettings = cache(
  async (areaId: string): Promise<Settings | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("settings")
        .select(
          "area_id, currency, tax_rate, revenue_goal, allowed_origins, gateway_fee_pct, gateway_fee_fixed",
        )
        .eq("area_id", areaId)
        .maybeSingle();

      if (error || !data) return null;
      return data as Settings;
    } catch {
      return null;
    }
  },
);
