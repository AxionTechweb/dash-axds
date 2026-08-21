-- =============================================================================
-- Avisos por WhatsApp (Evolution API)
-- =============================================================================
-- Dois gatilhos, cron externo (mesmo esquema do checkpoint diário — precisa
-- rodar a cada ~15min, além do 1x/dia nativo da Vercel Hobby):
--  1. Nenhuma venda aprovada nos últimos 60 minutos.
--  2. Conta de anúncio desativada na Meta (account_status != 1), OU uma
--     Regra de automação pausou uma campanha/conjunto/anúncio.
--
-- `alert_state` guarda o último alerta por (área, tipo) pra não spammar a
-- cada execução do cron — o aviso de "sem vendas" só repete quando o motivo
-- muda (uma venda nova aconteceu e a seca recomeçou depois).
-- =============================================================================

create table public.whatsapp_integrations (
  area_id      uuid primary key references public.areas(id) on delete cascade,
  base_url     text not null,
  instance     text not null,
  api_key      text not null,        -- cifrado (base64 pgcrypto)
  target_number text not null,       -- número ou JID de grupo (ex.: "5511999998888" ou "120363...@g.us")
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.alert_state (
  area_id        uuid not null references public.areas(id) on delete cascade,
  alert_type     text not null,      -- ex.: "no_sales", "account_status:act_123"
  last_alerted_at timestamptz,
  last_state     jsonb,
  updated_at     timestamptz not null default now(),
  primary key (area_id, alert_type)
);

alter table public.meta_ad_accounts
  add column if not exists last_known_status integer;

alter table public.whatsapp_integrations enable row level security;
alter table public.alert_state enable row level security;

drop policy if exists "authenticated read" on public.whatsapp_integrations;
create policy "authenticated read" on public.whatsapp_integrations
  for select to authenticated using (true);

drop policy if exists "authenticated read" on public.alert_state;
create policy "authenticated read" on public.alert_state
  for select to authenticated using (true);

grant select on public.whatsapp_integrations to authenticated;
grant all on public.whatsapp_integrations to service_role;
grant select on public.alert_state to authenticated;
grant all on public.alert_state to service_role;

create trigger set_updated_at
  before update on public.whatsapp_integrations
  for each row execute function public.set_updated_at();
