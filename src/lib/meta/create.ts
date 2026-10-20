import "server-only";

import { getAdAccounts, type AdAccount } from "./client";
import { META_GRAPH_BASE } from "./config";
import {
  DEFAULT_URL_TAGS,
  MULTI_ADVERTISER_OPT_OUT,
  messageDestinationType,
  type CampaignGoal,
  type MessageDestination,
} from "./create-config";

/**
 * CRIAÇÃO de campanhas na Marketing API (campanha → conjunto → criativo → anúncio)
 * e duplicação de campanhas existentes. Exige token com `ads_management`.
 *
 * Mesmas regras de `write.ts`: nunca envia eventos de conversão; toda chamada
 * vem de uma Server Action que checou a sessão, confirmou com o usuário e
 * registra em audit_log. Se um passo falha no meio, a campanha criada até ali é
 * apagada — nunca fica lixo pela metade na conta.
 */

type Resolved = { account: AdAccount; token: string; actId: string } | { error: string };

async function resolveAccount(areaId: string, accountRowId: string): Promise<Resolved> {
  const accounts = await getAdAccounts(areaId);
  const account = accounts.find((a) => a.id === accountRowId);
  if (!account) return { error: "Conta de anúncio não encontrada." };
  if (!account.ads_token) return { error: "Token da conta não configurado." };
  const actId = account.ad_account_id.startsWith("act_")
    ? account.ad_account_id
    : `act_${account.ad_account_id}`;
  return { account, token: account.ads_token, actId };
}

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };

type GraphErrorBody = {
  error?: { message?: string; error_user_title?: string; error_user_msg?: string };
};

function graphError(body: GraphErrorBody | null, status: number): string {
  const e = body?.error;
  return e?.error_user_msg ?? e?.message ?? `HTTP ${status}`;
}

async function graphGet<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<GraphResult<T>> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  try {
    const response = await fetch(`${META_GRAPH_BASE}/${path}?${qs}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as (T & GraphErrorBody) | null;
    if (!response.ok || !body) return { ok: false, error: graphError(body, response.status) };
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha na requisição" };
  }
}

/** GET de uma lista seguindo a paginação da Meta até o fim (sem teto de 100). */
async function graphGetAll<T>(
  path: string,
  token: string,
  params: Record<string, string>,
  maxPages = 50,
): Promise<GraphResult<{ data: T[] }>> {
  const all: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await graphGet<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      path,
      token,
      after ? { ...params, after } : params,
    );
    if (!result.ok) return page === 0 ? result : { ok: true, data: { data: all } };
    all.push(...(result.data.data ?? []));
    after = result.data.paging?.cursors?.after;
    if (!result.data.paging?.next || !after) break;
  }
  return { ok: true, data: { data: all } };
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown> | FormData,
): Promise<GraphResult<T>> {
  try {
    const isForm = body instanceof FormData;
    if (isForm) body.set("access_token", token);

    const response = await fetch(`${META_GRAPH_BASE}/${path}`, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify({ ...body, access_token: token }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as (T & GraphErrorBody) | null;
    if (!response.ok || !payload) {
      return { ok: false, error: graphError(payload, response.status) };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha na requisição" };
  }
}

async function graphDelete(id: string, token: string): Promise<void> {
  try {
    await fetch(`${META_GRAPH_BASE}/${id}?${new URLSearchParams({ access_token: token })}`, {
      method: "DELETE",
      cache: "no-store",
    });
  } catch {
    // limpeza de melhor esforço
  }
}

/* ------------------------------------------------------------ ativos da conta */

export type AccountAssets = {
  /** instagram = conta do IG ligada à página (destino Instagram Direct). */
  pages: { id: string; name: string; instagram: { id: string; username: string | null } | null }[];
  pixels: { id: string; name: string }[];
  campaigns: { id: string; name: string; status: string; dailyBudget: number | null }[];
  currency: string | null;
  error: string | null;
};

/** Páginas, pixels e campanhas existentes da conta — alimentam os selects. */
export async function loadAccountAssets(
  areaId: string,
  accountRowId: string,
): Promise<AccountAssets> {
  const empty: AccountAssets = { pages: [], pixels: [], campaigns: [], currency: null, error: null };
  const resolved = await resolveAccount(areaId, accountRowId);
  if ("error" in resolved) return { ...empty, error: resolved.error };

  const { token, actId, account } = resolved;
  type Edge<T> = { data?: T[] };

  type PageEdge = Edge<{
    id: string;
    name: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
  // Com a conta do Instagram de cada página; se o token não puder ler o IG,
  // cai para só id/nome (senão a lista de páginas inteira sumiria).
  const loadPages = async () => {
    const withIg = await graphGet<PageEdge>(`${actId}/promote_pages`, token, {
      fields: "id,name,instagram_business_account{id,username}",
      limit: "100",
    });
    if (withIg.ok) return withIg;
    return graphGet<PageEdge>(`${actId}/promote_pages`, token, { fields: "id,name", limit: "100" });
  };

  const [pages, pixels, campaigns] = await Promise.all([
    loadPages(),
    graphGet<Edge<{ id: string; name: string }>>(`${actId}/adspixels`, token, {
      fields: "id,name",
      limit: "100",
    }),
    graphGetAll<{ id: string; name: string; effective_status: string; daily_budget?: string }>(
      `${actId}/campaigns`,
      token,
      {
        fields: "id,name,effective_status,daily_budget",
        limit: "200",
        effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
      },
    ),
  ]);

  const errors = [pages, pixels, campaigns].flatMap((r) => (r.ok ? [] : [r.error]));

  return {
    pages: pages.ok
      ? (pages.data.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          instagram: p.instagram_business_account
            ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null }
            : null,
        }))
      : [],
    pixels: pixels.ok ? (pixels.data.data ?? []) : [],
    campaigns: campaigns.ok
      ? (campaigns.data.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.effective_status,
          dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        }))
      : [],
    currency: account.currency,
    error: errors.length > 0 ? errors[0] : null,
  };
}

/* --------------------------------------------------------------------- imagem */

export async function uploadAdImage(
  areaId: string,
  accountRowId: string,
  file: File,
): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  const resolved = await resolveAccount(areaId, accountRowId);
  if ("error" in resolved) return { ok: false, error: resolved.error };

  const form = new FormData();
  form.set("filename", file, file.name);

  const result = await graphPost<{ images?: Record<string, { hash?: string }> }>(
    `${resolved.actId}/adimages`,
    resolved.token,
    form,
  );
  if (!result.ok) return { ok: false, error: result.error };

  const hash = Object.values(result.data.images ?? {})[0]?.hash;
  if (!hash) return { ok: false, error: "A Meta não devolveu o hash da imagem." };
  return { ok: true, hash };
}

/* -------------------------------------------------------------- criar campanha */

export type CreateCampaignInput = {
  areaId: string;
  accountRowId: string;
  goal: CampaignGoal;
  campaignName: string;
  /** Orçamento diário da CAMPANHA (CBO), em unidade de moeda (convertido para centavos aqui). */
  dailyBudget: number;
  /** true = cria já ATIVA; false = PAUSADA. */
  active: boolean;
  pageId: string;
  pixelId: string | null;
  whatsappNumber: string | null;
  /** Objetivo "Mensagens": para onde a conversa vai (1 ou mais). */
  messageDestinations: MessageDestination[];
  /** Só Vendas: "messages" = conversão em app de mensagens em vez do site. */
  conversionLocation: "website" | "messages";
  /** Conta do Instagram ligada à página — obrigatória se Instagram é destino. */
  instagramUserId: string | null;
  link: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  /** Um anúncio por criativo, sem limite. */
  creatives: CreativeInput[];
};

export type CreativeInput = {
  adName: string;
  primaryText: string;
  headline: string;
  cta: string;
  imageHash: string;
};

/**
 * A Meta aceita no máximo 50 anúncios por conjunto. Acima disso a campanha
 * ganha conjuntos extras com a mesma configuração ("#2", "#3"...).
 */
export const MAX_ADS_PER_ADSET = 50;

export type CreateCampaignResult =
  | {
      ok: true;
      campaignId: string;
      adSetIds: string[];
      adIds: string[];
      /** Criativos que deram erro e ficaram de fora (os outros foram criados). */
      skipped: { name: string; error: string }[];
    }
  | { ok: false; error: string };

export async function createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
  const resolved = await resolveAccount(input.areaId, input.accountRowId);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { token, actId } = resolved;

  const status = input.active ? "ACTIVE" : "PAUSED";
  const goal = input.goal;

  const objective = {
    sales: "OUTCOME_SALES",
    leads: "OUTCOME_LEADS",
    traffic: "OUTCOME_TRAFFIC",
    whatsapp: "OUTCOME_ENGAGEMENT",
  }[goal];

  // 1) Campanha
  const campaign = await graphPost<{ id: string }>(`${actId}/campaigns`, token, {
    name: input.campaignName,
    objective,
    status,
    special_ad_categories: [],
    buying_type: "AUCTION",
    // Sempre CBO (orçamento de campanha Advantage+): o orçamento e a estratégia
    // de lance ficam na campanha, e a Meta distribui entre os conjuntos.
    daily_budget: String(Math.round(input.dailyBudget * 100)),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });
  if (!campaign.ok) return { ok: false, error: `Campanha: ${campaign.error}` };
  const campaignId = campaign.data.id;

  const fail = async (step: string, error: string): Promise<CreateCampaignResult> => {
    await graphDelete(campaignId, token);
    return { ok: false, error: `${step}: ${error} (nada foi criado na conta)` };
  };

  // 2) Conjunto de anúncios
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.countries },
    age_min: input.ageMin,
    age_max: input.ageMax,
    targeting_automation: { advantage_audience: 0 },
  };
  if (input.gender === "male") targeting.genders = [1];
  if (input.gender === "female") targeting.genders = [2];

  const adSetBody: Record<string, unknown> = {
    name: input.campaignName,
    campaign_id: campaignId,
    // Sem orçamento nem lance aqui: vêm da campanha (CBO).
    billing_event: "IMPRESSIONS",
    targeting,
    status,
  };

  // Mensagens, ou Vendas com conversão em app de mensagens.
  const usesMessages = goal === "whatsapp" || (goal === "sales" && input.conversionLocation === "messages");

  if (!usesMessages && (goal === "sales" || goal === "leads")) {
    if (!input.pixelId) return fail("Conjunto", "Escolha o pixel.");
    adSetBody.optimization_goal = "OFFSITE_CONVERSIONS";
    adSetBody.destination_type = "WEBSITE";
    adSetBody.promoted_object = {
      pixel_id: input.pixelId,
      custom_event_type: goal === "sales" ? "PURCHASE" : "LEAD",
    };
  } else if (goal === "traffic") {
    adSetBody.optimization_goal = "LINK_CLICKS";
    adSetBody.destination_type = "WEBSITE";
  } else {
    // Mensagens: destino escolhido (WhatsApp, Messenger, Instagram ou combinação).
    const dests = input.messageDestinations;
    const destinationType = messageDestinationType(dests);
    if (!destinationType) return fail("Conjunto", "Escolha o destino das mensagens.");
    if (dests.includes("whatsapp") && !input.whatsappNumber) {
      return fail("Conjunto", "Informe o número do WhatsApp.");
    }
    if (dests.includes("instagram") && !input.instagramUserId) {
      return fail("Conjunto", "A página escolhida não tem Instagram conectado.");
    }
    adSetBody.optimization_goal = "CONVERSATIONS";
    adSetBody.destination_type = destinationType;
    adSetBody.promoted_object = {
      page_id: input.pageId,
      ...(dests.includes("whatsapp") ? { whatsapp_phone_number: input.whatsappNumber } : {}),
    };
  }

  if (input.creatives.length === 0) return fail("Anúncio", "Adicione ao menos um criativo.");

  const isMessages = usesMessages;
  const dests = input.messageDestinations;
  const onlyWhatsapp = isMessages && dests.length === 1 && dests[0] === "whatsapp";
  // Botão do anúncio de mensagem: WhatsApp puro mantém o formato que já
  // funcionava; com Messenger/Instagram vira "Enviar mensagem" (MESSAGE_PAGE),
  // com o app de destino só quando há um destino só.
  const singleDest = dests.length === 1 ? dests[0] : null;
  const messageCta = onlyWhatsapp
    ? { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } }
    : {
        type: "MESSAGE_PAGE",
        value: singleDest
          ? { app_destination: singleDest === "instagram" ? "INSTAGRAM_DIRECT" : "MESSENGER" }
          : {},
      };
  const messageLink = dests.includes("whatsapp")
    ? "https://api.whatsapp.com/send"
    : "https://fb.com/messenger_doc/";
  const adSetIds: string[] = [];
  const adIds: string[] = [];
  // Criativo com erro é PULADO e informado — um erro no criativo 40 de 50 não
  // pode apagar os outros 49. Só desfaz tudo se nenhum anúncio sair.
  const skipped: { name: string; error: string }[] = [];

  // Fatias de até 50 criativos: cada fatia vira um conjunto com seus anúncios.
  for (let start = 0; start < input.creatives.length; start += MAX_ADS_PER_ADSET) {
    const chunk = input.creatives.slice(start, start + MAX_ADS_PER_ADSET);
    const setNumber = start / MAX_ADS_PER_ADSET + 1;

    const adSet = await graphPost<{ id: string }>(`${actId}/adsets`, token, {
      ...adSetBody,
      name: setNumber === 1 ? input.campaignName : `${input.campaignName} #${setNumber}`,
    });
    if (!adSet.ok) {
      // Erro de configuração (pixel, público...) no 1º conjunto vale pra todos.
      if (setNumber === 1) return fail("Conjunto", adSet.error);
      chunk.forEach((item) => skipped.push({ name: item.adName, error: `conjunto ${setNumber}: ${adSet.error}` }));
      continue;
    }
    const adsBefore = adIds.length;

    for (const [offset, item] of chunk.entries()) {
      const label = `Criativo ${start + offset + 1} (${item.adName})`;

      // 3) Criativo
      const linkData: Record<string, unknown> = {
        image_hash: item.imageHash,
        message: item.primaryText,
        name: item.headline,
        link: isMessages ? messageLink : input.link,
        call_to_action: isMessages ? messageCta : { type: item.cta, value: { link: input.link } },
      };

      const creative = await graphPost<{ id: string }>(`${actId}/adcreatives`, token, {
        name: item.adName,
        object_story_spec: {
          page_id: input.pageId,
          link_data: linkData,
          // Instagram como destino exige a conta do IG no criativo.
          ...(isMessages && dests.includes("instagram") && input.instagramUserId
            ? { instagram_user_id: input.instagramUserId }
            : {}),
        },
        url_tags: DEFAULT_URL_TAGS,
        contextual_multi_ads: MULTI_ADVERTISER_OPT_OUT,
      });
      if (!creative.ok) {
        skipped.push({ name: label, error: creative.error });
        continue;
      }

      // 4) Anúncio
      const ad = await graphPost<{ id: string }>(`${actId}/ads`, token, {
        name: item.adName,
        adset_id: adSet.data.id,
        creative: { creative_id: creative.data.id },
        status,
      });
      if (!ad.ok) {
        await graphDelete(creative.data.id, token);
        skipped.push({ name: label, error: ad.error });
        continue;
      }
      adIds.push(ad.data.id);
    }

    // Conjunto que ficou sem nenhum anúncio não fica pendurado na conta.
    if (adIds.length === adsBefore) await graphDelete(adSet.data.id, token);
    else adSetIds.push(adSet.data.id);
  }

  if (adIds.length === 0) {
    const first = skipped[0];
    return fail(first ? first.name : "Anúncio", first ? first.error : "nenhum anúncio criado");
  }

  return { ok: true, campaignId, adSetIds, adIds, skipped };
}

/* ------------------------------------------------------------------ duplicar */

export type DuplicateResult =
  | { ok: true; campaignId: string; warning: string | null }
  | { ok: false; error: string };

export async function duplicateCampaign(input: {
  areaId: string;
  accountRowId: string;
  sourceCampaignId: string;
  newName: string;
  /** Novo orçamento diário (unidade de moeda); null mantém o da origem. */
  dailyBudget: number | null;
  active: boolean;
}): Promise<DuplicateResult> {
  const resolved = await resolveAccount(input.areaId, input.accountRowId);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { token } = resolved;

  const statusOption = input.active ? "ACTIVE" : "PAUSED";
  const warnings: string[] = [];

  type CopyResponse = {
    copied_campaign_id?: string;
    copied_adset_id?: string;
    copied_ad_id?: string;
    ad_object_ids?: { copied_id?: string }[];
  };

  // 1ª tentativa: cópia profunda numa chamada só. A Meta só faz isso de forma
  // síncrona para campanhas pequenas (poucos conjuntos/anúncios).
  let newId: string | undefined;
  const deep = await graphPost<CopyResponse>(`${input.sourceCampaignId}/copies`, token, {
    deep_copy: true,
    status_option: statusOption,
  });

  if (deep.ok) {
    newId = deep.data.copied_campaign_id ?? deep.data.ad_object_ids?.[0]?.copied_id;
  } else {
    // 2ª: copia em partes — campanha, cada conjunto e cada anúncio, um por vez.
    const shallow = await graphPost<CopyResponse>(`${input.sourceCampaignId}/copies`, token, {
      deep_copy: false,
      status_option: statusOption,
    });
    if (!shallow.ok) return { ok: false, error: `Duplicação: ${deep.error}` };
    newId = shallow.data.copied_campaign_id ?? shallow.data.ad_object_ids?.[0]?.copied_id;
    if (!newId) return { ok: false, error: "A Meta não devolveu o ID da cópia." };

    const states = JSON.stringify(["ACTIVE", "PAUSED"]);
    const sets = await graphGetAll<{ id: string; name: string }>(`${input.sourceCampaignId}/adsets`, token, {
      fields: "id,name",
      effective_status: states,
      limit: "100",
    });
    if (!sets.ok) warnings.push(`conjuntos não copiados (${sets.error})`);

    let copiedAds = 0;
    for (const set of sets.ok ? sets.data.data : []) {
      const setCopy = await graphPost<CopyResponse>(`${set.id}/copies`, token, {
        campaign_id: newId,
        deep_copy: false,
        status_option: statusOption,
      });
      const newSetId = setCopy.ok
        ? (setCopy.data.copied_adset_id ?? setCopy.data.ad_object_ids?.[0]?.copied_id)
        : undefined;
      if (!newSetId) {
        warnings.push(`conjunto "${set.name}" não copiado (${setCopy.ok ? "sem ID" : setCopy.error})`);
        continue;
      }

      const ads = await graphGetAll<{ id: string; name: string }>(`${set.id}/ads`, token, {
        fields: "id,name",
        effective_status: states,
        limit: "100",
      });
      if (!ads.ok) {
        warnings.push(`anúncios do conjunto "${set.name}" não copiados (${ads.error})`);
        continue;
      }
      for (const ad of ads.data.data) {
        const adCopy = await graphPost(`${ad.id}/copies`, token, {
          adset_id: newSetId,
          status_option: statusOption,
        });
        if (adCopy.ok) copiedAds += 1;
        else warnings.push(`anúncio "${ad.name}" não copiado (${adCopy.error})`);
      }
    }
    if (copiedAds === 0) warnings.push("nenhum anúncio foi copiado — confira a cópia na Meta");
  }

  if (!newId) return { ok: false, error: "A Meta não devolveu o ID da cópia." };

  const rename = await graphPost(`${newId}`, token, { name: input.newName });
  if (!rename.ok) warnings.push(`não consegui renomear (${rename.error})`);

  if (input.dailyBudget !== null) {
    const cents = String(Math.round(input.dailyBudget * 100));
    const info = await graphGet<{ daily_budget?: string }>(newId, token, {
      fields: "daily_budget",
    });

    if (info.ok && info.data.daily_budget) {
      // Orçamento no nível da campanha (CBO).
      const r = await graphPost(`${newId}`, token, { daily_budget: cents });
      if (!r.ok) warnings.push(`orçamento não atualizado (${r.error})`);
    } else {
      const sets = await graphGet<{ data?: { id: string; daily_budget?: string }[] }>(
        `${newId}/adsets`,
        token,
        { fields: "id,daily_budget", limit: "50" },
      );
      if (!sets.ok) {
        warnings.push(`orçamento não atualizado (${sets.error})`);
      } else {
        for (const set of sets.data.data ?? []) {
          if (!set.daily_budget) continue;
          const r = await graphPost(set.id, token, { daily_budget: cents });
          if (!r.ok) warnings.push(`orçamento do conjunto ${set.id}: ${r.error}`);
        }
      }
    }
  }

  return {
    ok: true,
    campaignId: newId,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  };
}

/* ------------------------------------------------- parâmetros de URL em massa */

type ExistingCreative = {
  id: string;
  url_tags?: string;
  object_story_spec?: Record<string, unknown>;
  object_story_id?: string;
  effective_object_story_id?: string;
  asset_feed_spec?: Record<string, unknown>;
  contextual_multi_ads?: { enroll_status?: string };
};

type ExistingAd = {
  id: string;
  name: string;
  effective_status: string;
  creative?: ExistingCreative;
};

export type UrlTagsBatchResult =
  | {
      ok: true;
      updated: number;
      failed: { adId: string; name: string; error: string }[];
      /** Anúncios que ainda estão sem os parâmetros (fora os que falharam). */
      remaining: number;
      alreadyOk: number;
    }
  | { ok: false; error: string };

/** Anúncio fora do padrão: sem os parâmetros de URL ou com "vários anunciantes" marcado. */
function needsStandard(ad: ExistingAd, urlTags: string): boolean {
  if (ad.creative?.url_tags !== urlTags) return true;
  // Só conta quando a Meta devolve o campo — sem ele, não dá pra saber e não
  // recriamos à toa (senão o mesmo anúncio voltaria pra revisão toda vez).
  const status = ad.creative?.contextual_multi_ads?.enroll_status;
  return status !== undefined && status !== MULTI_ADVERTISER_OPT_OUT.enroll_status;
}

async function listAdsWithCreatives(actId: string, token: string) {
  const base = "id,url_tags,object_story_spec,object_story_id,effective_object_story_id,asset_feed_spec";
  const list = (creativeFields: string) =>
    graphGetAll<ExistingAd>(`${actId}/ads`, token, {
      fields: `id,name,effective_status,creative{${creativeFields}}`,
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "PENDING_REVIEW", "WITH_ISSUES", "IN_PROCESS"]),
      limit: "100",
    });
  const withMultiAds = await list(`${base},contextual_multi_ads`);
  // Se a Meta recusar o campo de "vários anunciantes", segue só com os parâmetros.
  return withMultiAds.ok ? withMultiAds : list(base);
}

/** Quantos anúncios da conta já têm / ainda não têm os parâmetros. */
export async function countUrlTagsStatus(
  areaId: string,
  accountRowId: string,
  urlTags: string,
): Promise<{ ok: true; total: number; missing: number } | { ok: false; error: string }> {
  const resolved = await resolveAccount(areaId, accountRowId);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const ads = await listAdsWithCreatives(resolved.actId, resolved.token);
  if (!ads.ok) return { ok: false, error: ads.error };
  const list = ads.data.data;
  return { ok: true, total: list.length, missing: list.filter((a) => needsStandard(a, urlTags)).length };
}

/**
 * Aplica `urlTags` nos anúncios existentes que ainda não têm. A Meta não deixa
 * editar criativo, então para cada anúncio: cria um criativo novo igual ao
 * atual + url_tags e troca o criativo do anúncio (vai para nova revisão).
 *
 * Processa até `batchSize` por chamada para caber no tempo da função; a tela
 * chama de novo até `remaining` zerar. `skip` = ids que já falharam nesta
 * rodada, para não tentar de novo em loop.
 */
export async function applyUrlTagsBatch(
  areaId: string,
  accountRowId: string,
  urlTags: string,
  batchSize: number,
  skip: string[],
): Promise<UrlTagsBatchResult> {
  const resolved = await resolveAccount(areaId, accountRowId);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { token, actId } = resolved;

  const ads = await listAdsWithCreatives(actId, token);
  if (!ads.ok) return { ok: false, error: ads.error };

  const skipSet = new Set(skip);
  const all = ads.data.data;
  const pending = all.filter((a) => needsStandard(a, urlTags) && !skipSet.has(a.id));
  const batch = pending.slice(0, batchSize);

  let updated = 0;
  const failed: { adId: string; name: string; error: string }[] = [];

  for (const ad of batch) {
    const current = ad.creative;
    if (!current) {
      failed.push({ adId: ad.id, name: ad.name, error: "anúncio sem criativo legível" });
      continue;
    }

    // Recria o criativo a partir do que ele já é: post pronto (object_story_id)
    // ou especificação montada (object_story_spec, com ou sem asset_feed_spec).
    const body: Record<string, unknown> = {
      name: `${ad.name} · utm`,
      url_tags: urlTags,
      contextual_multi_ads: MULTI_ADVERTISER_OPT_OUT,
    };
    if (current.object_story_spec) {
      body.object_story_spec = current.object_story_spec;
      if (current.asset_feed_spec) body.asset_feed_spec = current.asset_feed_spec;
    } else if (current.object_story_id || current.effective_object_story_id) {
      body.object_story_id = current.object_story_id ?? current.effective_object_story_id;
    } else {
      failed.push({ adId: ad.id, name: ad.name, error: "formato de criativo não suportado" });
      continue;
    }

    const creative = await graphPost<{ id: string }>(`${actId}/adcreatives`, token, body);
    if (!creative.ok) {
      failed.push({ adId: ad.id, name: ad.name, error: creative.error });
      continue;
    }

    const swap = await graphPost(ad.id, token, { creative: { creative_id: creative.data.id } });
    if (!swap.ok) {
      await graphDelete(creative.data.id, token);
      failed.push({ adId: ad.id, name: ad.name, error: swap.error });
      continue;
    }
    updated += 1;
  }

  return {
    ok: true,
    updated,
    failed,
    remaining: pending.length - batch.length,
    alreadyOk: all.length - pending.length - skipSet.size,
  };
}
