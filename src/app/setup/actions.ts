"use server";

import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSetupToken } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type SetupState = { error?: string };

const SetupSchema = z.object({
  token: z.string().min(1, "Informe o SETUP_TOKEN."),
  email: z.email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  areaName: z.string().min(1, "Informe o nome da primeira área."),
});

/** Comparação em tempo constante (evita ataque de timing no token). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Já existe algum usuário no painel? Se sim, o /setup fica desativado. */
export async function hasAnyUser(): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw error;
  return (data?.users?.length ?? 0) > 0;
}

/**
 * Cria o primeiro admin e a primeira área. Só funciona enquanto NÃO existir
 * nenhum usuário — depois disso a rota se desativa sozinha.
 */
export async function runSetup(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const parsed = SetupSchema.safeParse({
    token: String(formData.get("token") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    areaName: String(formData.get("areaName") ?? "").trim(),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { token, email, password, areaName } = parsed.data;

  let expectedToken: string;
  try {
    expectedToken = getSetupToken();
  } catch {
    return { error: "SETUP_TOKEN não está configurado no ambiente." };
  }

  if (!safeEqual(token, expectedToken)) {
    return { error: "SETUP_TOKEN inválido." };
  }

  try {
    if (await hasAnyUser()) {
      return {
        error: "O setup já foi concluído. Esta rota está desativada.",
      };
    }

    const admin = createAdminClient();

    // 1) Primeiro admin (e-mail já confirmado — signup público segue OFF).
    const { error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError) {
      return { error: `Não foi possível criar o usuário: ${userError.message}` };
    }

    // 2) Primeira área + linha de settings correspondente.
    const { data: area, error: areaError } = await admin
      .from("areas")
      .insert({ nome: areaName })
      .select("id")
      .single();
    if (areaError || !area) {
      return { error: `Usuário criado, mas falhou ao criar a área: ${areaError?.message}` };
    }

    const { error: settingsError } = await admin
      .from("settings")
      .insert({ area_id: area.id });
    if (settingsError) {
      return {
        error: `Área criada, mas falhou ao criar as settings: ${settingsError.message}`,
      };
    }
  } catch (err) {
    return {
      error: `Falha no setup: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    };
  }

  redirect("/login?setup=ok");
}
