-- Colunas novas em creative_reports para espelhar a planilha manual
-- "Consolidado SG Global" (pedido do usuário: CPA, CAC por comprador único,
-- Receita Líquida/Bruta, Margem de Lucro %, RPV, ARPU, taxas de conversão,
-- reembolso/chargeback/canceladas por criativo, compradores únicos, gasto em
-- USD antes do câmbio, dados de retenção 25/50/75% e tempo médio da Vturb,
-- conversões nativas da Vturb, e as datas da semana como colunas próprias).
--
-- `cac` já existe e mudou de fórmula no código (gasto/vendas totais → gasto/
-- compradores únicos); `cpa` é a coluna nova que herda a fórmula antiga.

alter table public.creative_reports
  add column if not exists spend_usd          numeric(14,2),
  add column if not exists vturb_views          integer,
  add column if not exists vturb_unique_views    integer,
  add column if not exists vturb_conversions     integer,
  add column if not exists vturb_revenue         numeric(14,2),
  add column if not exists retention_25          numeric(6,4),
  add column if not exists retention_50          numeric(6,4),
  add column if not exists retention_75          numeric(6,4),
  add column if not exists avg_watch_seconds     numeric(10,2),
  add column if not exists refund_value          numeric(14,2) not null default 0,
  add column if not exists chargeback_value      numeric(14,2) not null default 0,
  add column if not exists canceled_count        integer not null default 0,
  add column if not exists unique_buyers         integer not null default 0,
  add column if not exists cpa                   numeric(14,2),
  add column if not exists net_revenue           numeric(14,2),
  add column if not exists profit_margin_pct     numeric(7,4),
  add column if not exists rpv                    numeric(14,4),
  add column if not exists arpu                   numeric(14,4),
  add column if not exists conversion_rate        numeric(7,4),
  add column if not exists pv_ic_rate             numeric(7,4),
  add column if not exists checkout_rate          numeric(7,4);
