"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { getPlatform } from "@/lib/checkout/platforms";
import { encryptSecret } from "@/lib/crypto";
import {
  discoverAdAccounts,
  type DiscoveredAccount,
} from "@/lib/meta/discover";
import { testAdAccountConnection } from "@/lib/meta/test-connection";
import { createAdminClient } from "@/lib/supabase/admin";
import { testGa4Connection } from "@/lib/ga4/client";
import { testSheetsConnection } from "@/lib/sheets/client";
import {
  discoverUmblerOrganizations,
  type UmblerOrganization,
} from "@/lib/umbler/client";
import { testMetaWaConnection } from "@/lib/meta-wa/client";
import { testWhatsappConnection } from "@/lib/whatsapp/client";
import {
  discoverVturbPlayers,
  type DiscoveredPlayer,
} from "@/lib/vturb/discover";

export type FormState = { error?: string; ok?: string };

/** Estado do fluxo "colar token → listar contas → escolher". */
export type DiscoverState = {
  error?: string;
  ok?: string;
  accounts?: DiscoveredAccount[];
};

/**
 * Configuração das integrações. Todo segredo é CIFRADO (pgcrypto) antes de ir
 * para o banco; o painel nunca exibe o valor em claro, só se está configurado.
 */
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
  details: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "integration",
      details,
    });
  } catch {
    // auditoria não derruba a operação
  }
}

/* ------------------------------------------------------------- settings */

const SettingsSchema = z.object({
  currency: z.string().trim().length(3, "Use o código de 3 letras (ex.: BRL)."),
  tax_rate: z.coerce.number().min(0).max(100),
  revenue_goal: z.coerce.number().min(0),
  allowed_origins: z.string(),
  gateway_fee_pct: z.coerce.number().min(0).max(100),
  gateway_fee_fixed: z.coerce.number().min(0),
  break_even_value: z.coerce.number().min(0),
});

export async function saveSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = SettingsSchema.safeParse({
    currency: formData.get("currency"),
    tax_rate: formData.get("tax_rate"),
    revenue_goal: formData.get("revenue_goal"),
    allowed_origins: formData.get("allowed_origins") ?? "",
    gateway_fee_pct: formData.get("gateway_fee_pct") ?? 0,
    gateway_fee_fixed: formData.get("gateway_fee_fixed") ?? 0,
    break_even_value: formData.get("break_even_value") ?? 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Uma origem por linha.
  const origins = parsed.data.allowed_origins
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({
      currency: parsed.data.currency.toUpperCase(),
      tax_rate: parsed.data.tax_rate,
      revenue_goal: parsed.data.revenue_goal,
      allowed_origins: origins,
      gateway_fee_pct: parsed.data.gateway_fee_pct,
      gateway_fee_fixed: parsed.data.gateway_fee_fixed,
      break_even_value: parsed.data.break_even_value,
    })
    .eq("area_id", ctx.area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.settings", {
    currency: parsed.data.currency,
    tax_rate: parsed.data.tax_rate,
    origins: origins.length,
  });

  revalidatePath("/integracoes");
  return { ok: "Preferências salvas." };
}

/* ------------------------------------------------ tiers de produto */

const ProductTierSchema = z.object({
  produto: z.string().trim().min(1),
  tier: z.enum(["vd", "upsell", "downsell", "outro"]),
});

/**
 * Classifica um `produto` (nome vindo do webhook de checkout) em VD/Upsell/
 * Downsell/Outro — alimenta a quebra de receita por tier do relatório
 * semanal (src/lib/attribution.ts, getWeeklySalesByAdAndTier).
 */
export async function saveProductTier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = ProductTierSchema.safeParse({
    produto: formData.get("produto"),
    tier: formData.get("tier"),
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_tiers").upsert(
    { area_id: ctx.area.id, produto: parsed.data.produto, tier: parsed.data.tier },
    { onConflict: "area_id,produto" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  revalidatePath("/configuracoes");
  return { ok: `“${parsed.data.produto}” classificado.` };
}

/* ------------------------------------------------- segredos de webhook */

/**
 * Salva (ou remove) o segredo do webhook de UMA plataforma de checkout.
 * Uma linha por (área, plataforma) em `checkout_integrations`, com o valor
 * cifrado. A lista de plataformas válidas vem do registro.
 */
export async function saveCheckoutSecret(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const plataforma = String(formData.get("plataforma") ?? "");
  const platform = getPlatform(plataforma);
  if (!platform) return { error: "Plataforma inválida." };

  const value = String(formData.get("value") ?? "").trim();
  const admin = createAdminClient();

  // Campo vazio remove o segredo (desconecta a integração).
  if (!value) {
    const { error } = await admin
      .from("checkout_integrations")
      .delete()
      .eq("area_id", ctx.area.id)
      .eq("plataforma", plataforma);

    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.checkout_secret", {
      plataforma,
      removed: true,
    });
    revalidatePath("/integracoes");
    return { ok: `${platform.label} desconectada.` };
  }

  const { error } = await admin.from("checkout_integrations").upsert(
    {
      area_id: ctx.area.id,
      plataforma,
      secret: await encryptSecret(value),
      enabled: true,
    },
    { onConflict: "area_id,plataforma" },
  );

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.checkout_secret", {
    plataforma,
    removed: false,
  });

  revalidatePath("/integracoes");
  return { ok: `${platform.label} conectada — segredo cifrado.` };
}

/* --------------------------------------- Meta: descobrir e conectar contas */

/**
 * Etapa 1: cola o token → lista TODAS as contas de anúncio que ele enxerga.
 *
 * O token não volta para o cliente por aqui — quem o mantém é o próprio campo
 * do formulário, que o usuário acabou de digitar. Nada é gravado nesta etapa.
 */
export async function discoverAccounts(
  _prev: DiscoverState,
  formData: FormData,
): Promise<DiscoverState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  if (!token) return { error: "Cole o token do System User." };

  const result = await discoverAdAccounts(token);
  if (!result.ok) return { error: result.error };

  return {
    accounts: result.accounts,
    ok: `${result.accounts.length} conta(s) encontrada(s).`,
  };
}

/**
 * Etapa 2: grava as contas marcadas, todas com o mesmo token (cifrado).
 *
 * Revalida o token contra a Meta antes de gravar e confirma que as contas
 * escolhidas realmente estão entre as que ele enxerga — não confiamos no que
 * voltou do formulário.
 */
export async function connectAccounts(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  const selected = formData.getAll("selected").map(String).filter(Boolean);

  if (!token) return { error: "Token ausente. Busque as contas novamente." };
  if (selected.length === 0) {
    return { error: "Marque ao menos uma conta para conectar." };
  }

  const result = await discoverAdAccounts(token);
  if (!result.ok) return { error: result.error };

  const byId = new Map(result.accounts.map((a) => [a.id, a]));
  const invalid = selected.filter((id) => !byId.has(id));
  if (invalid.length > 0) {
    return {
      error: `Este token não enxerga: ${invalid.join(", ")}. Busque as contas novamente.`,
    };
  }

  const encrypted = await encryptSecret(token);
  const admin = createAdminClient();

  // Uma linha por conta; o mesmo token cifrado se repete em cada uma.
  const rows = selected.map((id) => ({
    area_id: ctx.area.id,
    label: byId.get(id)?.name ?? id,
    ad_account_id: id,
    ads_token: encrypted,
    currency: byId.get(id)?.currency ?? null,
  }));

  // Remove as que já existiam para não duplicar ao reconectar.
  await admin
    .from("meta_ad_accounts")
    .delete()
    .eq("area_id", ctx.area.id)
    .in("ad_account_id", selected);

  const { error } = await admin.from("meta_ad_accounts").insert(rows);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_accounts_connect", {
    accounts: selected,
    count: selected.length,
  });

  revalidatePath("/integracoes");
  return {
    ok: `${selected.length} conta(s) conectada(s) e validada(s).`,
  };
}

/* ------------------------------------------------ contas de anúncio Meta */

const AccountSchema = z.object({
  label: z.string().trim().min(1, "Informe um rótulo."),
  ad_account_id: z
    .string()
    .trim()
    .regex(/^(act_)?\d{5,25}$/, "ID da conta inválido (ex.: act_1234567890)."),
  ads_token: z.string().trim().min(20, "Informe o token de System User."),
});

export async function saveAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = AccountSchema.safeParse({
    label: formData.get("label"),
    ad_account_id: formData.get("ad_account_id"),
    ads_token: formData.get("ads_token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Valida token e escopos ANTES de salvar.
  const test = await testAdAccountConnection(
    parsed.data.ads_token,
    parsed.data.ad_account_id,
  );
  if (!test.ok) {
    return { error: test.error ?? "Não foi possível validar a conexão." };
  }

  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const encrypted = await encryptSecret(parsed.data.ads_token);

  const row = {
    area_id: ctx.area.id,
    label: parsed.data.label,
    ad_account_id: parsed.data.ad_account_id,
    ads_token: encrypted,
    currency: test.accountCurrency ?? null,
  };

  const { error } = id
    ? await admin.from("meta_ad_accounts").update(row).eq("id", id)
    : await admin.from("meta_ad_accounts").insert(row);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account", {
    label: parsed.data.label,
    account: parsed.data.ad_account_id,
    updated: Boolean(id),
  });

  revalidatePath("/integracoes");
  return {
    ok: `Conta “${test.accountName ?? parsed.data.label}” conectada e validada.`,
  };
}

export async function deleteAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Conta não informada." };

  const admin = createAdminClient();
  const { error } = await admin.from("meta_ad_accounts").delete().eq("id", id);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account_delete", { id });

  revalidatePath("/integracoes");
  return { ok: "Conta removida." };
}

/**
 * Liga/desliga o alerta de WhatsApp de "conta desativada" pra UMA conta —
 * útil quando `account_status` da Meta fica piscando numa conta já
 * desativada há tempo e o aviso vira ruído em vez de novidade.
 */
export async function toggleAccountAlertMute(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  const muted = formData.get("muted") === "true";
  if (!id) return { error: "Conta não informada." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("meta_ad_accounts")
    .update({ alerts_muted: muted })
    .eq("id", id)
    .eq("area_id", ctx.area.id);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account_mute", { id, muted });

  revalidatePath("/integracoes");
  return { ok: muted ? "Alerta de status silenciado." : "Alerta de status reativado." };
}

/* ------------------------------------------------- Vturb: players monitorados */

/** Estado do fluxo "colar API key → listar vídeos → escolher". */
export type DiscoverVturbState = {
  error?: string;
  ok?: string;
  players?: DiscoveredPlayer[];
};

/**
 * Etapa 1: cola a API key → lista TODOS os vídeos que ela enxerga.
 * Nada é gravado nesta etapa; a chave só vive no campo do formulário.
 */
export async function discoverVturb(
  _prev: DiscoverVturbState,
  formData: FormData,
): Promise<DiscoverVturbState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (!apiKey) return { error: "Cole a API key da Vturb." };

  const result = await discoverVturbPlayers(ctx.area.id, apiKey);
  if (!result.ok) return { error: result.error };

  return { players: result.players, ok: `${result.players.length} vídeo(s) encontrado(s).` };
}

/**
 * Etapa 2: grava a API key (cifrada) e substitui a lista de players
 * monitorados pelos marcados — mesmo raciocínio da checklist da Meta.
 * Revalida a chave contra a Vturb antes de gravar.
 */
export async function connectVturb(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  const selected = formData.getAll("selected").map(String).filter(Boolean);

  if (!apiKey) return { error: "API key ausente. Busque os vídeos novamente." };
  if (selected.length === 0) {
    return { error: "Marque ao menos um vídeo para monitorar." };
  }

  const result = await discoverVturbPlayers(ctx.area.id, apiKey);
  if (!result.ok) return { error: result.error };

  const byId = new Map(result.players.map((p) => [p.id, p]));
  const invalid = selected.filter((id) => !byId.has(id));
  if (invalid.length > 0) {
    return {
      error: `Esta chave não enxerga: ${invalid.join(", ")}. Busque os vídeos novamente.`,
    };
  }

  const admin = createAdminClient();
  const encrypted = await encryptSecret(apiKey);

  const { error: integrationError } = await admin
    .from("vturb_integrations")
    .upsert(
      { area_id: ctx.area.id, api_key: encrypted, enabled: true },
      { onConflict: "area_id" },
    );
  if (integrationError) {
    return { error: `Falha ao salvar a chave: ${integrationError.message}` };
  }

  // A checklist marcada é a lista completa desejada — substitui a anterior.
  await admin.from("vturb_players").delete().eq("area_id", ctx.area.id);

  const rows = selected.map((id) => ({
    area_id: ctx.area.id,
    player_id: id,
    label: byId.get(id)?.name ?? id,
  }));

  const { error } = await admin.from("vturb_players").insert(rows);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.vturb_connect", {
    players: selected,
    count: selected.length,
  });

  revalidatePath("/integracoes");
  return { ok: `${selected.length} vídeo(s) monitorado(s).` };
}

export async function deleteVturbPlayer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Vídeo não informado." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("vturb_players")
    .delete()
    .eq("id", id)
    .eq("area_id", ctx.area.id);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.vturb_player_delete", { id });

  revalidatePath("/integracoes");
  return { ok: "Vídeo removido do monitoramento." };
}

/* ------------------------------------------------ Google Sheets: destino */

/** Aceita a URL inteira da planilha ou só o ID, e extrai o ID. */
function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];

  // Sem "/" — assume que já é o ID puro.
  return /^[a-zA-Z0-9-_]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Salva (ou remove) a integração com o Google Sheets. Testa a credencial
 * contra a API ANTES de gravar — mesmo raciocínio de saveAdAccount, que
 * valida o token da Meta antes de persistir.
 */
export async function saveSheetsIntegration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const rawSpreadsheet = String(formData.get("spreadsheet") ?? "").trim();
  const serviceAccountJson = String(formData.get("service_account_json") ?? "").trim();
  const admin = createAdminClient();

  // Os dois campos vazios removem a integração (desconecta).
  if (!rawSpreadsheet && !serviceAccountJson) {
    const { error } = await admin
      .from("google_sheets_integrations")
      .delete()
      .eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.sheets_disconnect", {});
    revalidatePath("/integracoes");
    return { ok: "Google Sheets desconectado." };
  }

  const spreadsheetId = extractSpreadsheetId(rawSpreadsheet);
  if (!spreadsheetId) return { error: "Cole a URL da planilha ou o ID dela." };

  if (!serviceAccountJson) {
    return { error: "Cole o JSON da service account." };
  }

  try {
    JSON.parse(serviceAccountJson);
  } catch {
    return { error: "JSON inválido — cole o arquivo da chave da service account inteiro." };
  }

  const test = await testSheetsConnection(spreadsheetId, serviceAccountJson);
  if (!test.ok) {
    return {
      error: `Não foi possível acessar a planilha: ${test.error}. Confirme que ela foi compartilhada com o client_email da service account como Editor.`,
    };
  }

  const { error } = await admin.from("google_sheets_integrations").upsert(
    {
      area_id: ctx.area.id,
      spreadsheet_id: spreadsheetId,
      service_account_json: await encryptSecret(serviceAccountJson),
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.sheets_connect", {
    spreadsheet_id: spreadsheetId,
  });

  revalidatePath("/integracoes");
  return { ok: `Conectado a "${test.title}".` };
}

/**
 * Mesma coisa, pra 2ª planilha (checkpoints diários por campanha,
 * `daily_campaign_sheets`) — pode ser a mesma service account do relatório
 * semanal (só precisa compartilhar essa planilha também com o
 * client_email) ou uma diferente.
 */
export async function saveDailyCampaignSheetsIntegration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const rawSpreadsheet = String(formData.get("spreadsheet") ?? "").trim();
  const serviceAccountJson = String(formData.get("service_account_json") ?? "").trim();
  const admin = createAdminClient();

  if (!rawSpreadsheet && !serviceAccountJson) {
    const { error } = await admin
      .from("daily_campaign_sheets")
      .delete()
      .eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.daily_sheets_disconnect", {});
    revalidatePath("/integracoes");
    return { ok: "Google Sheets (checkpoints diários) desconectado." };
  }

  const spreadsheetId = extractSpreadsheetId(rawSpreadsheet);
  if (!spreadsheetId) return { error: "Cole a URL da planilha ou o ID dela." };

  if (!serviceAccountJson) {
    return { error: "Cole o JSON da service account." };
  }

  try {
    JSON.parse(serviceAccountJson);
  } catch {
    return { error: "JSON inválido — cole o arquivo da chave da service account inteiro." };
  }

  const test = await testSheetsConnection(spreadsheetId, serviceAccountJson);
  if (!test.ok) {
    return {
      error: `Não foi possível acessar a planilha: ${test.error}. Confirme que ela foi compartilhada com o client_email da service account como Editor.`,
    };
  }

  const { error } = await admin.from("daily_campaign_sheets").upsert(
    {
      area_id: ctx.area.id,
      spreadsheet_id: spreadsheetId,
      service_account_json: await encryptSecret(serviceAccountJson),
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.daily_sheets_connect", {
    spreadsheet_id: spreadsheetId,
  });

  revalidatePath("/integracoes");
  return { ok: `Conectado a "${test.title}".` };
}

/* -------------------------------------------------------------------- GA4 */

/**
 * Conexão do GA4 (página de destino, painel /ga4) — property ID (só número)
 * + JSON da service account (pode ser a mesma do Sheets, desde que tenha a
 * Analytics Data API ativada e acesso de Leitor à propriedade). Testa antes
 * de salvar, mesmo raciocínio de saveSheetsIntegration.
 */
export async function saveGa4Integration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const propertyId = String(formData.get("property_id") ?? "").trim();
  const serviceAccountJson = String(formData.get("service_account_json") ?? "").trim();
  const admin = createAdminClient();

  if (!propertyId && !serviceAccountJson) {
    const { error } = await admin.from("ga4_integrations").delete().eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.ga4_disconnect", {});
    revalidatePath("/integracoes");
    return { ok: "GA4 desconectado." };
  }

  if (!/^\d+$/.test(propertyId)) {
    return { error: "ID da propriedade inválido — é só o número (sem o \"G-\")." };
  }
  if (!serviceAccountJson) {
    return { error: "Cole o JSON da service account." };
  }

  try {
    JSON.parse(serviceAccountJson);
  } catch {
    return { error: "JSON inválido — cole o arquivo da chave da service account inteiro." };
  }

  const test = await testGa4Connection(propertyId, serviceAccountJson);
  if (!test.ok) {
    return {
      error: `Não foi possível acessar a propriedade: ${test.error}. Confirme a Analytics Data API ativada e o e-mail da service account como Leitor em Admin → Gerenciamento de acesso à propriedade.`,
    };
  }

  const { error } = await admin.from("ga4_integrations").upsert(
    {
      area_id: ctx.area.id,
      property_id: propertyId,
      service_account_json: await encryptSecret(serviceAccountJson),
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.ga4_connect", { property_id: propertyId });

  revalidatePath("/integracoes");
  return { ok: "GA4 conectado." };
}

/** WhatsApp (Evolution API) — avisos de "sem venda há 1h" e "conta desativada". */
export async function saveWhatsappIntegration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const baseUrl = String(formData.get("base_url") ?? "").trim();
  const instance = String(formData.get("instance") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const targetNumber = String(formData.get("target_number") ?? "").trim();
  const admin = createAdminClient();

  if (!baseUrl && !instance && !apiKey && !targetNumber) {
    const { error } = await admin.from("whatsapp_integrations").delete().eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.whatsapp_disconnect", {});
    revalidatePath("/integracoes");
    return { ok: "WhatsApp desconectado." };
  }

  if (!baseUrl || !instance || !targetNumber) {
    return { error: "Preencha URL base, instância e número de destino." };
  }
  if (!/^https?:\/\/.+/.test(baseUrl)) {
    return { error: "URL base inválida — precisa começar com http(s)://." };
  }

  // Reaproveita a api_key já salva quando o campo vem em branco (edição sem
  // recolar o segredo) — mesmo padrão do restante das integrações.
  let finalApiKey = apiKey;
  if (!finalApiKey) {
    const { data: existing } = await admin
      .from("whatsapp_integrations")
      .select("api_key")
      .eq("area_id", ctx.area.id)
      .maybeSingle();
    if (!existing?.api_key) return { error: "Informe a API key." };
    const { decryptSecret } = await import("@/lib/crypto");
    finalApiKey = await decryptSecret(existing.api_key as string);
  }

  const test = await testWhatsappConnection(baseUrl, instance, finalApiKey);
  if (!test.ok) {
    return { error: `Não foi possível conectar: ${test.error}` };
  }

  const { error } = await admin.from("whatsapp_integrations").upsert(
    {
      area_id: ctx.area.id,
      base_url: baseUrl,
      instance,
      api_key: await encryptSecret(finalApiKey),
      target_number: targetNumber,
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.whatsapp_connect", { instance });

  revalidatePath("/integracoes");
  return { ok: "WhatsApp conectado." };
}

/* ---------------------------------------------------------------- Umbler */

export type DiscoverUmblerState = {
  error?: string;
  ok?: string;
  organizations?: UmblerOrganization[];
};

/** Etapa 1: cola o token → lista as organizações que ele enxerga. */
export async function discoverUmbler(
  _prev: DiscoverUmblerState,
  formData: FormData,
): Promise<DiscoverUmblerState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const apiToken = String(formData.get("api_token") ?? "").trim();
  if (!apiToken) return { error: "Cole o token da Umbler Talk." };

  const result = await discoverUmblerOrganizations(apiToken);
  if (!result.ok) return { error: result.error };

  return {
    organizations: result.organizations,
    ok: `${result.organizations.length} organização(ões) encontrada(s).`,
  };
}

/** Etapa 2: grava o token (cifrado) + a organização escolhida. */
export async function saveUmblerIntegration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const apiToken = String(formData.get("api_token") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();

  if (!apiToken) {
    const admin = createAdminClient();
    const { error } = await admin.from("umbler_integrations").delete().eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.umbler_disconnect", {});
    revalidatePath("/integracoes");
    return { ok: "Umbler desconectado." };
  }

  if (!organizationId) return { error: "Escolha a organização." };

  const admin = createAdminClient();
  const { error } = await admin.from("umbler_integrations").upsert(
    {
      area_id: ctx.area.id,
      api_token: await encryptSecret(apiToken),
      organization_id: organizationId,
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.umbler_connect", { organization_id: organizationId });

  revalidatePath("/integracoes");
  return { ok: "Umbler conectado." };
}

/** Testa a conexão sem salvar (botão "Testar conexão"). */
export async function testConnection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  const account = String(formData.get("ad_account_id") ?? "").trim();

  if (!token || !account) {
    return { error: "Informe o ID da conta e o token para testar." };
  }

  const test = await testAdAccountConnection(token, account);

  if (!test.ok) return { error: test.error ?? "Falha na conexão." };

  return {
    ok: `OK — ${test.accountName ?? account} (${test.accountCurrency ?? "?"}). Escopos: ${test.scopes?.join(", ")}`,
  };
}

/* --------------------------------------------- WhatsApp Cloud API (Meta) */

/** Valida e grava a credencial da API oficial da Meta (token cifrado). */
export async function saveMetaWaIntegration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const accessToken = String(formData.get("access_token") ?? "").trim();
  const wabaId = String(formData.get("waba_id") ?? "").trim();
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();

  const admin = createAdminClient();

  // Tudo vazio = desconectar.
  if (!accessToken && !wabaId && !phoneNumberId) {
    const { error } = await admin.from("meta_wa_integrations").delete().eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.meta_wa_disconnect", {});
    revalidatePath("/integracoes");
    revalidatePath("/disparos");
    return { ok: "API oficial desconectada." };
  }

  if (!/^\d{5,30}$/.test(wabaId)) return { error: "WABA ID inválido (só números)." };
  if (!/^\d{5,30}$/.test(phoneNumberId)) return { error: "Phone Number ID inválido (só números)." };

  // Sem token novo, mantém o já salvo e só atualiza os IDs.
  if (!accessToken) {
    const { data: existing } = await admin
      .from("meta_wa_integrations")
      .select("area_id")
      .eq("area_id", ctx.area.id)
      .maybeSingle();
    if (!existing) return { error: "Cole o token de acesso permanente." };

    const { error } = await admin
      .from("meta_wa_integrations")
      .update({ waba_id: wabaId, phone_number_id: phoneNumberId })
      .eq("area_id", ctx.area.id);
    if (error) return { error: `Falha ao salvar: ${error.message}` };

    revalidatePath("/integracoes");
    revalidatePath("/disparos");
    return { ok: "IDs atualizados (token mantido)." };
  }

  const test = await testMetaWaConnection(accessToken, phoneNumberId);
  if (!test.ok) return { error: test.error };

  const { error } = await admin.from("meta_wa_integrations").upsert(
    {
      area_id: ctx.area.id,
      access_token: await encryptSecret(accessToken),
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone: test.displayPhone,
      enabled: true,
    },
    { onConflict: "area_id" },
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_wa_connect", {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
  });

  revalidatePath("/integracoes");
  revalidatePath("/disparos");
  return { ok: `API oficial conectada${test.displayPhone ? ` · ${test.displayPhone}` : ""}.` };
}
