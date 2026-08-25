/**
 * Status interno unificado das compras.
 *
 * O mapeamento de cada plataforma para estes valores vive no registro em
 * `src/lib/checkout/platforms.ts` (campo `statusMap`), junto com o resto do que
 * varia por plataforma. Aqui fica só o tipo, que é compartilhado.
 */
export type PurchaseStatus =
  | "approved"
  | "pending"
  | "refunded"
  | "chargeback"
  | "canceled"
  /** Aguardando confirmação de pagamento (ex.: PayT "waiting_payment") — distinto de "pending" genérico. */
  | "waiting_payment"
  /** Cliente abandonou o checkout antes de pagar (ex.: PayT "lost_cart"). */
  | "abandoned";
