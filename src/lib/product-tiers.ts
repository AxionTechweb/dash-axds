import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Tier de cada produto da área (Configurações → Tiers de produto).
 * Fonte única pra ROAS Front/Backend e contagem de Upsell/Downsell:
 * Front = VD + Outro (e produto ainda não classificado);
 * Backend = Upsell + Downsell (+ Recuperação, somada à parte).
 */
export type ProductTier = "vd" | "upsell" | "downsell" | "outro";

export async function getProductTierMap(areaId: string): Promise<Map<string, ProductTier>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("product_tiers")
      .select("produto, tier")
      .eq("area_id", areaId);
    return new Map(
      (data ?? []).map((row) => [row.produto as string, row.tier as ProductTier]),
    );
  } catch {
    return new Map();
  }
}

export function tierOf(
  tiers: Map<string, ProductTier>,
  produto: string | null | undefined,
): ProductTier {
  return (produto ? tiers.get(produto) : undefined) ?? "outro";
}
