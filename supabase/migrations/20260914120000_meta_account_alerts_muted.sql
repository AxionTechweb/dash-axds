-- Silenciar o alerta de "conta desativada" por conta — pedido do usuário
-- depois de account_status da Meta ficar piscando por dias numa conta já
-- desativada há semanas (USD 3): a confirmação de recuperação sustentada
-- (3 checagens seguidas) não bastou porque a piscada durou mais que isso.
-- Em vez de tentar afinar o algoritmo pra sempre, dá controle manual.

alter table public.meta_ad_accounts
  add column if not exists alerts_muted boolean not null default false;
