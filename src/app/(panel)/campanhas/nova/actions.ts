"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import {
  CTA_IDS,
  DEFAULT_URL_TAGS,
  GOAL_OPTIONS,
  MESSAGE_DESTINATIONS,
  type CampaignGoal,
  type MessageDestination,
} from "@/lib/meta/create-config";
import {
  applyUrlTagsBatch,
  countUrlTagsStatus,
  createCampaign,
  duplicateCampaign,
  uploadAdImage,
  type CreativeInput,
} from "@/lib/meta/create";
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
  // Vendas pode converter no site (pixel + link) ou em app de mensagens.
  const conversionLocation = goal === "sales" && text(formData, "conversionLocation", 20) === "messages" ? "messages" : "website";
  const usesMessages = goal === "whatsapp" || conversionLocation === "messages";

  if (((goal === "sales" && !usesMessages) || goal === "leads") && (!pixelId || !/^\d+$/.test(pixelId))) {
    return { error: "Escolha o pixel." };
  }

  const link = text(formData, "link", 1000) || null;
  if (!usesMessages) {
    if (!link || !/^https:\/\/[^\s]+$/i.test(link)) {
      return { error: "Informe o link de destino começando com https://" };
    }
  }

  const messageDestinations = formData
    .getAll("messageDest")
    .map(String)
    .filter((d): d is MessageDestination => MESSAGE_DESTINATIONS.some((m) => m.id === d));
  if (usesMessages && messageDestinations.length === 0) {
    return { error: "Escolha o destino das mensagens (WhatsApp, Messenger e/ou Instagram)." };
  }

  const whatsappNumber = text(formData, "whatsapp", 20).replace(/\D/g, "") || null;
  if (
    usesMessages &&
    messageDestinations.includes("whatsapp") &&
    (!whatsappNumber || whatsappNumber.length < 12)
  ) {
    return { error: "Informe o WhatsApp com DDI e DDD, ex.: 5511999998888." };
  }

  const instagramUserId = text(formData, "instagramUserId", 40) || null;
  if (usesMessages && messageDestinations.includes("instagram") && !/^\d+$/.test(instagramUserId ?? "")) {
    return { error: "A página escolhida não tem Instagram conectado. Conecte na Meta ou tire o Instagram." };
  }

  // Criativos: as imagens já subiram uma a uma (uploadAdImageAction); aqui só
  // chegam os hashes + textos, então não há limite de corpo da Vercel.
  let rawCreatives: unknown;
  try {
    rawCreatives = JSON.parse(String(formData.get("creatives") ?? "[]"));
  } catch {
    return { error: "Lista de criativos inválida." };
  }
  if (!Array.isArray(rawCreatives) || rawCreatives.length === 0) {
    return { error: "Adicione ao menos um criativo." };
  }

  const creatives: CreativeInput[] = [];
  for (const [index, raw] of rawCreatives.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const label = `Criativo ${index + 1}`;
    const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

    const imageHash = clip(item.imageHash, 100);
    const primaryText = clip(item.primaryText, 2000);
    const headline = clip(item.headline, 255);
    const cta = clip(item.cta, 30);
    if (!/^[a-f0-9]{16,64}$/i.test(imageHash)) return { error: `${label}: envie a imagem.` };
    if (!primaryText) return { error: `${label}: escreva o texto principal.` };
    if (!headline) return { error: `${label}: escreva o título.` };
    if (!usesMessages && !CTA_IDS.includes(cta)) return { error: `${label}: botão inválido.` };

    creatives.push({
      imageHash,
      primaryText,
      headline,
      cta,
      adName: clip(item.adName, 150) || `${campaignName} - ${index + 1}`,
    });
  }

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

  const result = await createCampaign({
    areaId: ctx.area.id,
    accountRowId,
    goal,
    campaignName,
    dailyBudget,
    active,
    pageId,
    pixelId,
    whatsappNumber: messageDestinations.includes("whatsapp") ? whatsappNumber : null,
    messageDestinations,
    conversionLocation,
    instagramUserId: messageDestinations.includes("instagram") ? instagramUserId : null,
    link,
    countries: ["BR"],
    ageMin,
    ageMax,
    gender: gender as "all" | "male" | "female",
    creatives,
  });

  await audit(ctx.area.id, ctx.user.email, "meta.create_campaign", result.ok ? result.campaignId : null, {
    goal,
    name: campaignName,
    dailyBudget,
    active,
    creatives: creatives.length,
    ok: result.ok,
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/campanhas");
  const summary = `${result.adIds.length} anúncio(s)${result.adSetIds.length > 1 ? ` em ${result.adSetIds.length} conjuntos` : ""}`;
  const skippedNote = result.skipped.length
    ? ` Ficaram de fora ${result.skipped.length} criativo(s) com erro: ${result.skipped
        .slice(0, 5)
        .map((s) => `${s.name} (${s.error})`)
        .join("; ")}${result.skipped.length > 5 ? "…" : ""}.`
    : "";
  return {
    ok:
      (active
        ? `Campanha criada e ATIVA com ${summary} (a Meta ainda analisa os anúncios antes de entregar).`
        : `Campanha criada PAUSADA com ${summary}. Revise e ative em Campanhas.`) + skippedNote,
    campaignId: result.campaignId,
  };
}

export type UploadImageState = { hash?: string; error?: string };

/**
 * Sobe UMA imagem para a biblioteca da conta e devolve o hash. O formulário
 * chama uma vez por criativo — cada chamada fica abaixo do limite de corpo da
 * Vercel (~4,5 MB), então o número de criativos não tem teto.
 */
export async function uploadAdImageAction(formData: FormData): Promise<UploadImageState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const accountRowId = text(formData, "accountId", 64);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Envie a imagem do anúncio." };
  if (!IMAGE_TYPES.includes(file.type)) return { error: "A imagem deve ser JPG ou PNG." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "A imagem passa de 4 MB. Comprima e tente de novo." };

  const upload = await uploadAdImage(ctx.area.id, accountRowId, file);
  if (!upload.ok) return { error: upload.error };
  return { hash: upload.hash };
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

/* ------------------------------------------- parâmetros de URL nos existentes */

export type UrlTagsStatus = { total?: number; missing?: number; error?: string };

export async function urlTagsStatusAction(accountId: string): Promise<UrlTagsStatus> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };
  const result = await countUrlTagsStatus(ctx.area.id, accountId, DEFAULT_URL_TAGS);
  if (!result.ok) return { error: result.error };
  return { total: result.total, missing: result.missing };
}

export type UrlTagsBatchState = {
  error?: string;
  updated?: number;
  failed?: { adId: string; name: string; error: string }[];
  remaining?: number;
};

/** Um lote (até 15 anúncios) — a tela chama de novo até remaining = 0. */
export async function applyUrlTagsBatchAction(
  accountId: string,
  skip: string[],
): Promise<UrlTagsBatchState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const result = await applyUrlTagsBatch(ctx.area.id, accountId, DEFAULT_URL_TAGS, 15, skip.slice(0, 2000));
  if (!result.ok) return { error: result.error };

  if (result.updated > 0 || result.failed.length > 0) {
    await audit(ctx.area.id, ctx.user.email, "meta.apply_url_tags", null, {
      updated: result.updated,
      failed: result.failed.map((f) => f.adId),
    });
  }
  if (result.updated > 0) revalidatePath("/campanhas");

  return { updated: result.updated, failed: result.failed, remaining: result.remaining };
}
