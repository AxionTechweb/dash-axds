"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { CTA_IDS, GOAL_OPTIONS, type CampaignGoal } from "@/lib/meta/create-config";
import { createCampaign, duplicateCampaign, uploadAdImage } from "@/lib/meta/create";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateState = {
  error?: string;
  ok?: string;
  campaignId?: string;
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // limite de corpo da Vercel ~4,5 MB
const IMAGE_TYPES = ["image/jpeg", "image/png"];

async function requireArea() {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." as const };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." as const };
  return { user, area };
}

async function audit(
  areaId: string,
  actorEmail: string | undefined,
  action: string,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  try {
    await createAdminClient().from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "meta_entity",
      target_id: targetId,
      details,
    });
  } catch {
    // auditoria nunca derruba a operação
  }
}

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function money(formData: FormData, key: string): number {
  return Number(String(formData.get(key) ?? "").replace(/\./g, "").replace(",", "."));
}

/** Cria campanha + conjunto + criativo + anúncio do zero. */
export async function createCampaignAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const accountRowId = text(formData, "accountId", 64);
  const goal = text(formData, "goal", 20) as CampaignGoal;
  if (!GOAL_OPTIONS.some((g) => g.id === goal)) return { error: "Escolha o objetivo." };

  const campaignName = text(formData, "name", 150);
  if (!campaignName) return { error: "Dê um nome à campanha." };

  const dailyBudget = money(formData, "dailyBudget");
  if (!Number.isFinite(dailyBudget) || dailyBudget < 1) {
    return { error: "Informe um orçamento diário válido." };
  }

  const pageId = text(formData, "pageId", 40);
  if (!/^\d+$/.test(pageId)) return { error: "Escolha a página do Facebook." };

  const pixelId = text(formData, "pixelId", 40) || null;
  if ((goal === "sales" || goal === "leads") && (!pixelId || !/^\d+$/.test(pixelId))) {
    return { error: "Escolha o pixel." };
  }

  const link = text(formData, "link", 1000) || null;
  if (goal !== "whatsapp") {
    if (!link || !/^https:\/\/[^\s]+$/i.test(link)) {
      return { error: "Informe o link de destino começando com https://" };
    }
  }

  const whatsappNumber = text(formData, "whatsapp", 20).replace(/\D/g, "") || null;
  if (goal === "whatsapp" && (!whatsappNumber || whatsappNumber.length < 12)) {
    return { error: "Informe o WhatsApp com DDI e DDD, ex.: 5511999998888." };
  }

  const primaryText = text(formData, "primaryText", 2000);
  const headline = text(formData, "headline", 255);
  if (!primaryText) return { error: "Escreva o texto principal do anúncio." };
  if (!headline) return { error: "Escreva o título do anúncio." };

  const cta = text(formData, "cta", 30);
  if (goal !== "whatsapp" && !CTA_IDS.includes(cta)) return { error: "Botão inválido." };

  const ageMin = Number(formData.get("ageMin") ?? 18);
  const ageMax = Number(formData.get("ageMax") ?? 65);
  if (!(ageMin >= 18 && ageMax <= 65 && ageMin <= ageMax)) {
    return { error: "Idade deve ficar entre 18 e 65, com mínimo menor que o máximo." };
  }

  const gender = text(formData, "gender", 10);
  if (!["all", "male", "female"].includes(gender)) return { error: "Gênero inválido." };

  const active = formData.get("active") === "on";
  if (active && formData.get("confirmActive") !== "yes") {
    return { error: "Confirme a ativação imediata." };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Envie a imagem do anúncio." };
  if (!IMAGE_TYPES.includes(file.type)) return { error: "A imagem deve ser JPG ou PNG." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "A imagem passa de 4 MB. Comprima e tente de novo." };

  const upload = await uploadAdImage(ctx.area.id, accountRowId, file);
  if (!upload.ok) return { error: `Imagem: ${upload.error}` };

  const result = await createCampaign({
    areaId: ctx.area.id,
    accountRowId,
    goal,
    campaignName,
    dailyBudget,
    active,
    pageId,
    pixelId,
    whatsappNumber,
    link,
    countries: ["BR"],
    ageMin,
    ageMax,
    gender: gender as "all" | "male" | "female",
    adName: text(formData, "adName", 150) || campaignName,
    primaryText,
    headline,
    cta,
    imageHash: upload.hash,
  });

  await audit(ctx.area.id, ctx.user.email, "meta.create_campaign", result.ok ? result.campaignId : null, {
    goal,
    name: campaignName,
    dailyBudget,
    active,
    ok: result.ok,
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/campanhas");
  return {
    ok: active
      ? "Campanha criada e ATIVA (a Meta ainda analisa o anúncio antes de entregar)."
      : "Campanha criada PAUSADA. Revise e ative em Campanhas.",
    campaignId: result.campaignId,
  };
}

/** Duplica uma campanha existente (cópia profunda) com novo nome/orçamento. */
export async function duplicateCampaignAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const accountRowId = text(formData, "accountId", 64);
  const sourceCampaignId = text(formData, "sourceId", 40);
  if (!/^\d+$/.test(sourceCampaignId)) return { error: "Escolha a campanha de origem." };

  const newName = text(formData, "name", 150);
  if (!newName) return { error: "Dê um nome à cópia." };

  const budgetRaw = text(formData, "dailyBudget", 20);
  let dailyBudget: number | null = null;
  if (budgetRaw) {
    dailyBudget = money(formData, "dailyBudget");
    if (!Number.isFinite(dailyBudget) || dailyBudget < 1) {
      return { error: "Orçamento inválido." };
    }
  }

  const active = formData.get("active") === "on";
  if (active && formData.get("confirmActive") !== "yes") {
    return { error: "Confirme a ativação imediata." };
  }

  const result = await duplicateCampaign({
    areaId: ctx.area.id,
    accountRowId,
    sourceCampaignId,
    newName,
    dailyBudget,
    active,
  });

  await audit(ctx.area.id, ctx.user.email, "meta.duplicate_campaign", result.ok ? result.campaignId : null, {
    source: sourceCampaignId,
    name: newName,
    dailyBudget,
    active,
    ok: result.ok,
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/campanhas");
  return {
    ok: `${active ? "Cópia criada e ATIVA" : "Cópia criada PAUSADA"}.${result.warning ? ` Atenção: ${result.warning}.` : ""}`,
    campaignId: result.campaignId,
  };
}
