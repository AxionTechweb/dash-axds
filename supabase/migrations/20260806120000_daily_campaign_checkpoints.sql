-- =============================================================================
-- Acompanhamento diário por campanha (checkpoints intradia) → 2ª planilha
-- =============================================================================
-- Segunda automação de Google Sheets, independente do relatório semanal: um
-- cron externo (fora da Vercel, que no plano Hobby só roda 1x/dia) chama
-- /api/cron/daily-campaigns de hora em hora; a cada um dos 10 horários de
-- checkpoint do dia, grava o acumulado do dia por campanha ATIVA (Meta) +
-- vendas (checkout) numa aba "dd.mm.yyyy - campanha", duplicada de um
-- TEMPLATE que já tem fórmulas prontas pra CPA/ROAS/IMPOSTO/LUCRO — só as
-- colunas de dado bruto são escritas.
--   1) daily_campaign_sheets: credencial da planilha de destino (1/área).
--   2) daily_campaign_checkpoints: log/idempotência por área+dia+campanha+
--      horário.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Google Sheets — credencial da planilha de checkpoints diários (1/área).
--    Tabela separada de google_sheets_integrations: pode ser uma planilha e
--    credencial diferentes das do relatório semanal.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_campaign_sheets (
  area_id             uuid primary key references public.areas(id) on delete cascade,
  spreadsheet_id      text not null,
  service_account_json text,                       -- cifrado (base64 pgcrypto)
  template_tab_name    text not null default 'TEMPLATE',
  enabled              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_daily_campaign_sheets_updated_at
  on public.daily_campaign_sheets;
create trigger set_daily_campaign_sheets_updated_at
  before update on public.daily_campaign_sheets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) daily_campaign_checkpoints — 1 linha por área+dia+campanha+horário.
--    Upsert idempotente: o cron externo disparando 2x na mesma hora (ou
--    reprocessando) atualiza em vez de duplicar.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_campaign_checkpoints (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references public.areas(id) on delete cascade,
  day                date not null,
  campaign_id        text not null,
  campaign_name      text,
  horario            smallint not null,
  sheet_tab_name     text,
  spend              numeric(14,2) not null default 0,
  revenue            numeric(14,2) not null default 0,
  impressions        integer not null default 0,
  clicks             integer not null default 0,
  page_views         integer not null default 0,
  initiate_checkout  integer not null default 0,
  sales              integer not null default 0,
  status             text not null check (status in ('ok', 'error')),
  error              text,
  created_at         timestamptz not null default now(),
  unique (area_id, day, campaign_id, horario)
);

create index if not exists daily_campaign_checkpoints_area_day_idx
  on public.daily_campaign_checkpoints (area_id, day);

-- ---------------------------------------------------------------------------
-- 3) RLS — mesma regra do resto: leitura só para autenticado, escrita só
--    pelo servidor (service_role, que faz bypass de RLS).
-- ---------------------------------------------------------------------------
alter table public.daily_campaign_sheets       enable row level security;
alter table public.daily_campaign_checkpoints  enable row level security;

drop policy if exists "authenticated read" on public.daily_campaign_sheets;
create policy "authenticated read" on public.daily_campaign_sheets
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.daily_campaign_checkpoints;
create policy "authenticated read" on public.daily_campaign_checkpoints
  for select to authenticated using (true);

grant select on
  public.daily_campaign_sheets, public.daily_campaign_checkpoints
to authenticated;

grant all on
  public.daily_campaign_sheets, public.daily_campaign_checkpoints
to service_role;
