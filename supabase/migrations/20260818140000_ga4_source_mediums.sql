-- =============================================================================
-- GA4 — sessões por origem/mídia da sessão
-- =============================================================================
-- Terceira tabela da página /ga4, mesma credencial e cron das outras duas
-- (20260818120000, 20260818130000). Dimensão `sessionSourceMedium`,
-- validada contra a propriedade real: os valores batem exatos com a tela
-- do usuário ("FB / reteste-curiosidade-beneficio|..." = 9548 sessões).
-- =============================================================================

create table if not exists public.ga4_source_mediums (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas(id) on delete cascade,
  day           date not null,
  source_medium text not null,
  sessions      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (area_id, day, source_medium)
);

create index if not exists ga4_source_mediums_area_day_idx
  on public.ga4_source_mediums (area_id, day);

alter table public.ga4_source_mediums enable row level security;

drop policy if exists "authenticated read" on public.ga4_source_mediums;
create policy "authenticated read" on public.ga4_source_mediums
  for select to authenticated using (true);

grant select on public.ga4_source_mediums to authenticated;
grant all on public.ga4_source_mediums to service_role;
