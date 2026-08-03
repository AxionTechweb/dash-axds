-- =============================================================================
-- Adiciona payment_method em purchases
-- =============================================================================
-- Método de pagamento da venda (cartão, PIX, boleto...), quando a plataforma
-- de checkout manda esse campo no webhook. Alimenta o recorte "Vendas por
-- Pagamento" do Dashboard. Nulo quando a plataforma não informa — não é erro.
-- =============================================================================

alter table public.purchases
  add column if not exists payment_method text;
