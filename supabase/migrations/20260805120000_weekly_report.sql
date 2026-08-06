-- =============================================================================
-- Relatório Semanal por Criativo (Meta + Vturb + PayT/checkout) → Google Sheets
-- =============================================================================
-- O Supabase é a fonte de verdade dos números; um cron semanal calcula e grava
-- em `creative_reports`, e escreve uma cópia de leitura numa aba nova do Google
-- Sheets do usuário (registrada em `weekly_report_runs`). Este arquivo cria:
--   1) settings: taxas configuráveis usadas no cálculo de margem líquida.
--   2) product_tiers: classificação de `produto` em VD/Upsell/Downsell/Outro.
--   3) vturb_integrations + vturb_players: credencial e vídeos da Vturb.
--   4) google_sheets_integrations: credencial da planilha de destino.
--   5) creative_reports: snapshot semanal por ad_id (idempotente).
--   6) weekly_report_runs: log de execução por semana (idempotência da escrita).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) settings — taxas usadas no cálculo de margem líquida do relatório.
--    `tax_rate` (já existente) cobre o imposto sobre faturamento; o imposto
--    sobre o gasto de mídia já tem uma constante própria (META_AD_TAX_RATE,
--    em src/lib/meta/config.ts) reaproveitada aqui — sem duplicar.
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists gateway_fee_pct   numeric(5,2)  not null default 0,
  add column if not exists gateway_fee_fixed numeric(10,2) not null default 0,
  add column if not exists break_even_value  numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 2) Classificação de produto (VD / Upsell / Downsell / Outro), editável no
--    painel. Produto sem entrada aqui cai em "outro" — nunca quebra o cálculo.
-- ---------------------------------------------------------------------------
create table if not exists public.product_tiers (
  area_id    uuid not null references public.areas(id) on delete cascade,
  produto    text not null,
  tier       text not null default 'outro'
             check (tier in ('vd', 'upsell', 'downsell', 'outro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (area_id, produto)
);

create index if not exists product_tiers_area_idx
  on public.product_tiers (area_id);

drop trigger if exists set_product_tiers_updated_at on public.product_tiers;
create trigger set_product_tiers_updated_at
  before update on public.product_tiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Vturb — credencial (1/área) e vídeos monitorados (N/área). api_key
--    cifrada do mesmo jeito que ads_token/secret (app_encrypt, base64 TEXT).
-- ---------------------------------------------------------------------------
create table if not exists public.vturb_integrations (
  area_id    uuid primary key references public.areas(id) on delete cascade,
  api_key    text,                                 -- cifrado (base64 pgcrypto)
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_vturb_integrations_updated_at
  on public.vturb_integrations;
create trigger set_vturb_integrations_updated_at
  before update on public.vturb_integrations
  for each row execute function public.set_updated_at();

create table if not exists public.vturb_players (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.areas(id) on delete cascade,
  player_id  text not null,
  label      text not null,
  created_at timestamptz not null default now(),
  unique (area_id, player_id)
);

create index if not exists vturb_players_area_idx
  on public.vturb_players (area_id);

-- ---------------------------------------------------------------------------
-- 4) Google Sheets — credencial da planilha de destino (1/área). O JSON da
--    service account é cifrado como qualquer outro segredo.
-- ---------------------------------------------------------------------------
create table if not exists public.google_sheets_integrations (
  area_id             uuid primary key references public.areas(id) on delete cascade,
  spreadsheet_id      text not null,
  service_account_json text,                       -- cifrado (base64 pgcrypto)
  template_tab_name    text not null default 'TEMPLATE',
  enabled              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_google_sheets_integrations_updated_at
  on public.google_sheets_integrations;
create trigger set_google_sheets_integrations_updated_at
  before update on public.google_sheets_integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) creative_reports — snapshot semanal por criativo (ad_id). Upsert
--    idempotente por (area_id, week_start, ad_id): reprocessar a mesma
--    semana atualiza a linha em vez de duplicar.
-- ---------------------------------------------------------------------------
create table if not exists public.creative_reports (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references public.areas(id) on delete cascade,
  week_start         date not null,
  week_end           date not null,
  account_id         uuid,                         -- meta_ad_accounts.id (pode sumir)
  account_label      text,
  ad_id              text not null,
  ad_name            text,
  campaign_id        text,
  campaign_name      text,
  status             text,
  spend              numeric(14,2) not null default 0,
  impressions        integer not null default 0,
  clicks             integer not null default 0,
  page_views         integer not null default 0,
  initiate_checkout  integer not null default 0,
  meta_purchases     integer not null default 0,
  meta_revenue       numeric(14,2) not null default 0,
  vturb_player_id    text,
  hook_rate          numeric(6,4),
  play_rate          numeric(6,4),
  plays              integer,
  pitch_retention    numeric(6,4),
  cta_clicks         integer,
  sales_vd           integer not null default 0,
  revenue_vd         numeric(14,2) not null default 0,
  sales_upsell       integer not null default 0,
  revenue_upsell     numeric(14,2) not null default 0,
  sales_downsell     integer not null default 0,
  revenue_downsell   numeric(14,2) not null default 0,
  sales_total        integer not null default 0,
  revenue_total      numeric(14,2) not null default 0,
  roas               numeric(10,4),
  cac                numeric(14,2),
  net_margin         numeric(14,2),
  delta_meta_vs_own  integer,
  created_at         timestamptz not null default now(),
  unique (area_id, week_start, ad_id)
);

create index if not exists creative_reports_area_week_idx
  on public.creative_reports (area_id, week_start);

-- ---------------------------------------------------------------------------
-- 6) weekly_report_runs — log por semana processada (mesmo espírito de
--    rule_executions). Evita duplicar aba no Sheets se o cron rodar 2x.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_report_runs (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas(id) on delete cascade,
  week_start     date not null,
  week_end       date not null,
  sheet_tab_name text,
  status         text not null check (status in ('ok', 'error')),
  error          text,
  created_at     timestamptz not null default now(),
  unique (area_id, week_start)
);

create index if not exists weekly_report_runs_area_week_idx
  on public.weekly_report_runs (area_id, week_start);

-- ---------------------------------------------------------------------------
-- 7) RLS — mesma regra do resto: leitura só para autenticado, escrita só pelo
--    servidor (service_role, que faz bypass de RLS).
-- ---------------------------------------------------------------------------
alter table public.product_tiers               enable row level security;
alter table public.vturb_integrations           enable row level security;
alter table public.vturb_players                enable row level security;
alter table public.google_sheets_integrations   enable row level security;
alter table public.creative_reports             enable row level security;
alter table public.weekly_report_runs           enable row level security;

drop policy if exists "authenticated read" on public.product_tiers;
create policy "authenticated read" on public.product_tiers
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.vturb_integrations;
create policy "authenticated read" on public.vturb_integrations
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.vturb_players;
create policy "authenticated read" on public.vturb_players
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.google_sheets_integrations;
create policy "authenticated read" on public.google_sheets_integrations
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.creative_reports;
create policy "authenticated read" on public.creative_reports
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.weekly_report_runs;
create policy "authenticated read" on public.weekly_report_runs
  for select to authenticated using (true);

grant select on
  public.product_tiers, public.vturb_integrations, public.vturb_players,
  public.google_sheets_integrations, public.creative_reports,
  public.weekly_report_runs
to authenticated;

grant all on
  public.product_tiers, public.vturb_integrations, public.vturb_players,
  public.google_sheets_integrations, public.creative_reports,
  public.weekly_report_runs
to service_role;
