-- =============================================================================
-- Umbler Talk — página /umbler no painel
-- =============================================================================
-- Chats/contatos/setores/avaliações são lidos AO VIVO (uma chamada paginada
-- cada, mesmo espírito da página /vturb) — não precisam de tabela.
--
-- Só a contagem de templates enviados por dia precisa de snapshot: a API da
-- Umbler não tem uma rota "listar todas as mensagens da organização", só por
-- chat (GET /v1/chats/{chatId}/relative-messages/). Contar templates exige
-- varrer todos os chats do dia — caro demais pra fazer ao vivo a cada
-- carregamento da página, então um cron diário grava o agregado aqui.
-- =============================================================================

create table public.umbler_integrations (
  area_id         uuid primary key references public.areas(id) on delete cascade,
  api_token       text not null,      -- cifrado (base64 pgcrypto)
  organization_id text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.umbler_template_sends (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas(id) on delete cascade,
  day            date not null,
  template_id    text not null,
  template_label text,
  sends          integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (area_id, day, template_id)
);

create index umbler_template_sends_area_day_idx
  on public.umbler_template_sends (area_id, day);

alter table public.umbler_integrations enable row level security;
alter table public.umbler_template_sends enable row level security;

drop policy if exists "authenticated read" on public.umbler_integrations;
create policy "authenticated read" on public.umbler_integrations
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.umbler_template_sends;
create policy "authenticated read" on public.umbler_template_sends
  for select to authenticated using (true);

grant select on public.umbler_integrations to authenticated;
grant all on public.umbler_integrations to service_role;
grant select on public.umbler_template_sends to authenticated;
grant all on public.umbler_template_sends to service_role;

create trigger set_updated_at
  before update on public.umbler_integrations
  for each row execute function public.set_updated_at();
