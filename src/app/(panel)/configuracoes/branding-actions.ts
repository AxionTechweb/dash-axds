"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type BrandingState = { error?: string; ok?: string };

/**
 * Branding é GLOBAL da instância (linha única). É o que torna o template
 * white label: nome, logos, favicon e cor primária saem daqui, nunca do código.
 */
const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => v === null || /^https?:\/\/.+/.test(v) || v.startsWith("/"),
    "Use uma URL http(s) ou um caminho começando com /.",
  );

const BrandingSchema = z.object({
  product_name: z
    .string()
    .trim()
    .min(1, "Informe o nome do produto.")
    .max(60, "Nome muito longo."),
  logo_light_url: optionalUrl,
  logo_dark_url: optionalUrl,
  favicon_url: optionalUrl,
  primary_color_override: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine(
      (v) => v === null || /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(v),
      'Use o formato HSL sem a função, ex.: "142 76% 58%".',
    ),
});

export async function saveBranding(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const parsed = BrandingSchema.safeParse({
    product_name: formData.get("product_name"),
    logo_light_url: formData.get("logo_light_url") ?? "",
    logo_dark_url: formData.get("logo_dark_url") ?? "",
    favicon_url: formData.get("favicon_url") ?? "",
    primary_color_override: formData.get("primary_color_override") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("branding")
    .update(parsed.data)
    .eq("id", true);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await admin.from("audit_log").insert({
    actor_email: user.email ?? null,
    action: "config.branding",
    target_type: "branding",
    details: { product_name: parsed.data.product_name },
  });

  // O branding aparece no layout inteiro (título, sidebar, login).
  revalidatePath("/", "layout");
  return { ok: "Branding atualizado." };
}
