import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve a área a partir do token público do snippet, junto com as origens
 * permitidas (CORS). Usa service_role porque os endpoints de captura são
 * públicos (sem sessão).
 */
export type PublicArea = {
  id: string;
  allowedOrigins: string[];
};

export async function resolveAreaByToken(
  token: string,
): Promise<PublicArea | null> {
  try {
    const admin = createAdminClient();

    const { data: area, error } = await admin
      .from("areas")
      .select("id")
      .eq("public_token", token)
      .maybeSingle();

    if (error || !area) return null;

    const { data: settings } = await admin
      .from("settings")
      .select("allowed_origins")
      .eq("area_id", area.id)
      .maybeSingle();

    return {
      id: area.id,
      allowedOrigins: settings?.allowed_origins ?? [],
    };
  } catch (err) {
    // Env ausente / Supabase inacessível: trata como área não encontrada em vez
    // de estourar 500 num endpoint público.
    console.error("[public-area] falha ao resolver área:", err);
    return null;
  }
}
