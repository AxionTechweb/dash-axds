/** Gatilhos de disparo automático. Importável também por componentes de cliente. */
export const DISPATCH_TRIGGERS = [
  {
    id: "approved",
    label: "Compra aprovada",
    hint: "Pós-compra: boas-vindas, acesso, instruções.",
    defaultDelay: 0,
  },
  {
    id: "waiting_payment",
    label: "PIX / boleto pendente",
    hint: "Lembrete de pagamento. Pula se a compra já foi aprovada.",
    defaultDelay: 15,
  },
  {
    id: "abandoned",
    label: "Checkout abandonado",
    hint: "Recuperação de carrinho. Pula se a pessoa já comprou.",
    defaultDelay: 30,
  },
  {
    id: "lead",
    label: "Lead sem compra",
    hint: "Follow-up de quem deixou o telefone e não comprou.",
    defaultDelay: 60,
  },
] as const;

export type DispatchTrigger = (typeof DISPATCH_TRIGGERS)[number]["id"];

/** Variáveis que um template pode receber ({{1}}, {{2}}… na ordem escolhida). */
export const PARAM_OPTIONS = [
  { id: "primeiro_nome", label: "Primeiro nome" },
  { id: "nome", label: "Nome completo" },
  { id: "produto", label: "Produto" },
  { id: "valor", label: "Valor" },
  { id: "email", label: "E-mail" },
] as const;

export type ParamKey = (typeof PARAM_OPTIONS)[number]["id"];

export const PARAM_KEYS: string[] = PARAM_OPTIONS.map((p) => p.id);
