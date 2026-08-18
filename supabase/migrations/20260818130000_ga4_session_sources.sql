-- =============================================================================
-- GA4 — aquisição de tráfego por origem da sessão
-- =============================================================================
-- Segunda tabela da página /ga4, mesma credencial e cron de
-- ga4_landing_pages (20260818120000) — só mais um relatório sincronizado
-- junto. Dimensão `sessionSource` (validada contra a propriedade real: os
-- valores batem com "FB", "l.instagram.com", "direto" etc. da tela do
-- usuário — é o relatório padrão "Aquisição de tráfego").
-- =============================================================================

create table if not exists public.ga4_session_sources (
  id                         uuid primary key default gen_random_uuid(),
  area_id                    uuid not null references public.areas(id) on delete cascade,
  day                        date not null,
  source                     text not null,
  active_users               integer not null default 0,
  sessions                   integer not null default 0,
  engaged_sessions           integer not null default 0,
  avg_engagement_seconds     numeric(10,2),
  engaged_sessions_per_user  numeric(10,4),
  events_per_session         numeric(10,4),
  engagement_rate            numeric(7,4),
  key_events                 integer not null default 0,
  event_count                integer not null default 0,
  total_revenue              numeric(14,2) not null default 0,
  created_at                 timestamptz not null default now(),
  unique (area_id, day, source)
);

create index if not exists ga4_session_sources_area_day_idx
  on public.ga4_session_sources (area_id, day);

alter table public.ga4_session_sources enable row level security;

drop policy if exists "authenticated read" on public.ga4_session_sources;
create policy "authenticated read" on public.ga4_session_sources
  for select to authenticated using (true);

grant select on public.ga4_session_sources to authenticated;
grant all on public.ga4_session_sources to service_role;
