-- =============================================================================
-- GA4 — sessões/engajamento por página de destino
-- =============================================================================
-- Página nova no painel (não Sheets): um cron diário nativo da Vercel (Hobby
-- permite 1x/dia) puxa o relatório de "página de destino" do GA4 Data API
-- (últimos 28 dias) e grava um snapshot por dia — a página só lê o que já
-- está gravado, sem chamar a API na hora do acesso.
--   1) ga4_integrations: credencial (property ID + service account) por área.
--   2) ga4_landing_pages: snapshot diário por página de destino (+ uma linha
--      "(total)" com o agregado que a própria API já devolve).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Credencial do GA4 (1/área). service_account_json cifrado — pode ser a
--    mesma service account já usada nas integrações do Google Sheets, desde
--    que tenha a Analytics Data API ativada e acesso de Leitor à propriedade.
-- ---------------------------------------------------------------------------
create table if not exists public.ga4_integrations (
  area_id             uuid primary key references public.areas(id) on delete cascade,
  property_id         text not null,
  service_account_json text,                       -- cifrado (base64 pgcrypto)
  enabled              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_ga4_integrations_updated_at on public.ga4_integrations;
create trigger set_ga4_integrations_updated_at
  before update on public.ga4_integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) ga4_landing_pages — 1 linha por área+dia+página (mais uma linha
--    "(total)" por área+dia com o agregado). Upsert idempotente.
-- ---------------------------------------------------------------------------
create table if not exists public.ga4_landing_pages (
  id                     uuid primary key default gen_random_uuid(),
  area_id                uuid not null references public.areas(id) on delete cascade,
  day                    date not null,
  landing_page           text not null,
  sessions               integer not null default 0,
  active_users           integer not null default 0,
  new_users              integer not null default 0,
  avg_engagement_seconds numeric(10,2),
  key_events             integer not null default 0,
  total_revenue          numeric(14,2) not null default 0,
  key_event_rate         numeric(7,4),
  created_at             timestamptz not null default now(),
  unique (area_id, day, landing_page)
);

create index if not exists ga4_landing_pages_area_day_idx
  on public.ga4_landing_pages (area_id, day);

-- ---------------------------------------------------------------------------
-- 3) RLS — mesma regra do resto: leitura só para autenticado, escrita só
--    pelo servidor (service_role, que faz bypass de RLS).
-- ---------------------------------------------------------------------------
alter table public.ga4_integrations   enable row level security;
alter table public.ga4_landing_pages  enable row level security;

drop policy if exists "authenticated read" on public.ga4_integrations;
create policy "authenticated read" on public.ga4_integrations
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.ga4_landing_pages;
create policy "authenticated read" on public.ga4_landing_pages
  for select to authenticated using (true);

grant select on public.ga4_integrations, public.ga4_landing_pages to authenticated;
grant all on public.ga4_integrations, public.ga4_landing_pages to service_role;
