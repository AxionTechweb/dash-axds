/** Constantes da criação de campanha — sem `server-only`, a UI também usa. */

export type CampaignGoal = "sales" | "leads" | "traffic" | "whatsapp";

export const GOAL_OPTIONS: { id: CampaignGoal; label: string; hint: string }[] = [
  { id: "sales", label: "Vendas no site", hint: "Otimiza por compra. Precisa de pixel e do link do checkout." },
  { id: "leads", label: "Cadastro de lead (site)", hint: "Otimiza por lead no pixel. Precisa de pixel e do link da página." },
  { id: "traffic", label: "Tráfego", hint: "Otimiza por clique no link. Só precisa do link." },
  { id: "whatsapp", label: "Mensagens no WhatsApp", hint: "Otimiza por conversa iniciada. Precisa do número do WhatsApp." },
];

export const CTA_OPTIONS = [
  { id: "SHOP_NOW", label: "Comprar agora" },
  { id: "LEARN_MORE", label: "Saiba mais" },
  { id: "SIGN_UP", label: "Cadastre-se" },
  { id: "GET_OFFER", label: "Ver oferta" },
] as const;

export const CTA_IDS: string[] = CTA_OPTIONS.map((c) => c.id);

/**
 * Parâmetros de URL aplicados em TODO anúncio criado pelo painel (campo
 * `url_tags` do criativo). A Meta troca as macros {{...}} no clique. O
 * utm_content termina no {{ad.id}}, que o webhook de compra extrai pelo último
 * pedaço numérico — é o que liga a venda ao anúncio.
 */
export const DEFAULT_URL_TAGS =
  "utm_source=Facebook&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";

/**
 * "Anúncios com vários anunciantes" DESMARCADO em todo criativo criado pelo
 * painel (a Meta deixa marcado por padrão).
 */
export const MULTI_ADVERTISER_OPT_OUT = { enroll_status: "OPT_OUT" } as const;
