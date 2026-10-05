-- =============================================================================
-- Disparo de WhatsApp pela API OFICIAL da Meta (Cloud API) — página /disparos
-- =============================================================================
-- - meta_wa_integrations : credencial da área (token cifrado, WABA, número).
-- - wa_dispatch_rules    : 1 regra por gatilho (venda aprovada, PIX/boleto
--                          pendente, abandono de checkout, lead sem compra).
--                          Nascem DESLIGADAS — nada dispara sem o usuário ligar.
-- - wa_dispatch_log      : fila + histórico. Idempotente por (regra, origem):
--                          a mesma compra/visitante nunca dispara 2x a mesma regra.
-- - wa_optouts           : números que nunca devem receber disparo.
-- =============================================================================

create table public.meta_wa_integrations (
  area_id         uuid primary key references public.areas(id) on delete cascade,
  access_token    text not null,      -- cifrado (base64 pgcrypto)
  waba_id         text not null,      -- WhatsApp Business Account ID
  phone_number_id text not null,
  display_phone   text,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.wa_dispatch_rules (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.areas(id) on delete cascade,
  trigger           text not null check (trigger in ('approved', 'waiting_payment', 'abandoned', 'lead')),
  template_name     text not null,
  template_language text not null default 'pt_BR',
  -- Variáveis do corpo do template, na ordem {{1}}, {{2}}…
  body_params       text[] not null default '{}',
  delay_minutes     integer not null default 0 check (delay_minutes >= 0 and delay_minutes <= 10080),
  enabled           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (area_id, trigger)
);

create table public.wa_dispatch_log (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.areas(id) on delete cascade,
  rule_id           uuid references public.wa_dispatch_rules(id) on delete set null,
  trigger           text not null check (trigger in ('approved', 'waiting_payment', 'abandoned', 'lead', 'manual')),
  campaign_label    text,
  source_ref        text,             -- transaction_id / user_id do visitante
  telefone          text not null,    -- já normalizado (só dígitos, com DDI)
  template_name     text not null,
  template_language text not null default 'pt_BR',
  params            jsonb not null default '[]'::jsonb,
  status            text not null default 'queued'
                    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  error             text,
  wamid             text,
  scheduled_at      timestamptz not null default now(),
  sent_at           timestamptz,
  created_at        timestamptz not null default now()
);

create unique index wa_dispatch_log_rule_source_uidx
  on public.wa_dispatch_log (rule_id, source_ref)
  where rule_id is not null and source_ref is not null;
create index wa_dispatch_log_queue_idx
  on public.wa_dispatch_log (status, scheduled_at)
  where status = 'queued';
create index wa_dispatch_log_area_created_idx
  on public.wa_dispatch_log (area_id, created_at desc);
create index wa_dispatch_log_phone_idx
  on public.wa_dispatch_log (area_id, telefone, created_at desc);

create table public.wa_optouts (
  area_id    uuid not null references public.areas(id) on delete cascade,
  telefone   text not null,
  created_at timestamptz not null default now(),
  primary key (area_id, telefone)
);

alter table public.meta_wa_integrations enable row level security;
alter table public.wa_dispatch_rules enable row level security;
alter table public.wa_dispatch_log enable row level security;
alter table public.wa_optouts enable row level security;

drop policy if exists "authenticated read" on public.meta_wa_integrations;
create policy "authenticated read" on public.meta_wa_integrations
  for select to authenticated using (true);
drop policy if exists "authenticated read" on public.wa_dispatch_rules;
create policy "authenticated read" on public.wa_dispatch_rules
  for select to authenticated using (true);
drop policy if exists "authenticated read" on public.wa_dispatch_log;
create policy "authenticated read" on public.wa_dispatch_log
  for select to authenticated using (true);
drop policy if exists "authenticated read" on public.wa_optouts;
create policy "authenticated read" on public.wa_optouts
  for select to authenticated using (true);

grant select on public.meta_wa_integrations to authenticated;
grant all on public.meta_wa_integrations to service_role;
grant select on public.wa_dispatch_rules to authenticated;
grant all on public.wa_dispatch_rules to service_role;
grant select on public.wa_dispatch_log to authenticated;
grant all on public.wa_dispatch_log to service_role;
grant select on public.wa_optouts to authenticated;
grant all on public.wa_optouts to service_role;

create trigger set_updated_at
  before update on public.meta_wa_integrations
  for each row execute function public.set_updated_at();
create trigger set_updated_at
  before update on public.wa_dispatch_rules
  for each row execute function public.set_updated_at();
