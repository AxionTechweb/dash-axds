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
