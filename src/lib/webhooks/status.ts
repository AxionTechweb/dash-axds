/**
 * Mapeamento dos status de CADA plataforma para o status interno unificado.
 * Interno: approved | pending | refunded | chargeback | canceled
 */
export type PurchaseStatus =
  | "approved"
  | "pending"
  | "refunded"
  | "chargeback"
  | "canceled";

/** Hotmart: `data.purchase.status` (ou o nome do evento como fallback). */
const HOTMART_STATUS: Record<string, PurchaseStatus> = {
  APPROVED: "approved",
  COMPLETE: "approved",
  COMPLETED: "approved",

  STARTED: "pending",
  WAITING_PAYMENT: "pending",
  BILLET_PRINTED: "pending",
  PRINTED_BILLET: "pending",
  UNDER_ANALISYS: "pending",
  UNDER_ANALYSIS: "pending",
  DELAYED: "pending",

  REFUNDED: "refunded",

  CHARGEBACK: "chargeback",
  PROTESTED: "chargeback",

  CANCELED: "canceled",
  CANCELLED: "canceled",
  EXPIRED: "canceled",
  BLOCKED: "canceled",
  OVERDUE: "canceled",
};

/** Hotmart: nomes de evento (usados quando o status não vier no payload). */
const HOTMART_EVENT: Record<string, PurchaseStatus> = {
  PURCHASE_APPROVED: "approved",
  PURCHASE_COMPLETE: "approved",
  PURCHASE_BILLET_PRINTED: "pending",
  PURCHASE_DELAYED: "pending",
  PURCHASE_OUT_OF_SHOPPING_CART: "pending",
  PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "chargeback",
  PURCHASE_PROTEST: "chargeback",
  PURCHASE_CANCELED: "canceled",
  PURCHASE_EXPIRED: "canceled",
};

/** Kiwify: `order_status` (e nomes de evento como fallback). */
const KIWIFY_STATUS: Record<string, PurchaseStatus> = {
  paid: "approved",
  approved: "approved",

  waiting_payment: "pending",
  pending: "pending",

  refunded: "refunded",

  chargedback: "chargeback",
  chargeback: "chargeback",

  refused: "canceled",
  canceled: "canceled",
  cancelled: "canceled",
};

const KIWIFY_EVENT: Record<string, PurchaseStatus> = {
  compra_aprovada: "approved",
  compra_recusada: "canceled",
  compra_reembolsada: "refunded",
  chargeback: "chargeback",
  boleto_gerado: "pending",
  pix_gerado: "pending",
  subscription_renewed: "approved",
  subscription_canceled: "canceled",
  subscription_late: "pending",
};

function lookup(
  table: Record<string, PurchaseStatus>,
  value: unknown,
  normalize: (v: string) => string,
): PurchaseStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return table[normalize(value.trim())] ?? null;
}

const upper = (v: string) => v.toUpperCase();
const lower = (v: string) => v.toLowerCase();

/**
 * Resolve o status interno da Hotmart. Prioriza o status da compra e cai no
 * nome do evento. Status desconhecido vira `pending` (nunca descarta a venda).
 */
export function mapHotmartStatus(
  status: unknown,
  event: unknown,
): PurchaseStatus {
  return (
    lookup(HOTMART_STATUS, status, upper) ??
    lookup(HOTMART_EVENT, event, upper) ??
    "pending"
  );
}

/** Resolve o status interno da Kiwify (order_status, com fallback no evento). */
export function mapKiwifyStatus(
  status: unknown,
  event: unknown,
): PurchaseStatus {
  return (
    lookup(KIWIFY_STATUS, status, lower) ??
    lookup(KIWIFY_EVENT, event, lower) ??
    "pending"
  );
}
