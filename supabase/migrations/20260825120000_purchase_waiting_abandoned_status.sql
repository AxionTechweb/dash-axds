-- =============================================================================
-- Novos status de compra: waiting_payment e abandoned
-- =============================================================================
-- O usuário ligou 2 postbacks novos na PayT: "Aguardando Pagamento"
-- (status bruto "waiting_payment") e "Abandono de Checkout" (status bruto
-- "lost_cart"). Os dois já eram aceitos pelo webhook, mas caíam misturados
-- em status genéricos (pending / canceled, respectivamente) — sem KPI
-- próprio dava pra distinguir "aguardando pagamento" de qualquer outro
-- pendente, nem "abandonou o checkout" de qualquer outro cancelamento.
-- =============================================================================

alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in (
    'approved', 'pending', 'refunded', 'chargeback', 'canceled',
    'waiting_payment', 'abandoned'
  ));
