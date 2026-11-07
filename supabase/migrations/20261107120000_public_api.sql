-- API pública do Disparo API Oficial (/api/v1) — credenciais por área,
-- campanhas criadas pela API e webhook de saída (eventos para o sistema do cliente).
--
-- Tudo é acessado só pelo servidor (service_role). O painel lê as credenciais
-- e as entregas da própria área pelas server actions, nunca direto do browser.

create table if not exists public.api_credentials (
  area_id          uuid primary key references public.areas(id) on delete cascade,
  api_key          text not null unique,          -- público (x-api-key)
  secret_hash      text not null,                 -- sha256 hex do x-api-secret (o segredo nunca é guardado)
  webhook_url      text,
  webhook_secret   text,                          -- cifrado (app_encrypt), assina as entregas
  webhook_events   text[] not null default '{message.sent,message.failed,message.skipped,campaign.finished}',
  webhook_enabled  boolean not null default true,
  webhook_failures integer not null default 0,    -- entregas esgotadas seguidas; 3 desliga o webhook
  last_used_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.api_campaigns (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.areas(id) on delete cascade,
  label             text not null,
  template_name     text not null,
  template_language text not null,
  total             integer not null,
  scheduled_at      timestamptz not null default now(),
  finished_at       timestamptz,
  canceled_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists api_campaigns_area_created_idx
  on public.api_campaigns (area_id, created_at desc);

alter table public.wa_dispatch_log
  add column if not exists campaign_id uuid references public.api_campaigns(id) on delete set null;
create index if not exists wa_dispatch_log_campaign_idx
  on public.wa_dispatch_log (campaign_id, status)
  where campaign_id is not null;

create table if not exists public.api_webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  area_id         uuid not null references public.areas(id) on delete cascade,
  event           text not null,
  payload         jsonb not null,                 -- envelope completo, igual em todas as tentativas
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status     integer,
  last_error      text,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists api_webhook_deliveries_queue_idx
  on public.api_webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index if not exists api_webhook_deliveries_area_idx
  on public.api_webhook_deliveries (area_id, created_at desc);

alter table public.api_credentials enable row level security;
alter table public.api_campaigns enable row level security;
alter table public.api_webhook_deliveries enable row level security;

grant all on public.api_credentials to service_role;
grant all on public.api_campaigns to service_role;
grant all on public.api_webhook_deliveries to service_role;

drop trigger if exists set_updated_at on public.api_credentials;
create trigger set_updated_at
  before update on public.api_credentials
  for each row execute function public.set_updated_at();

-- Entrega dos webhooks pendentes/reentregas: a cada minuto (mesmo esquema dos outros crons).
select cron.unschedule('panel-webhooks') where exists (select 1 from cron.job where jobname = 'panel-webhooks');
select cron.schedule('panel-webhooks', '* * * * *', $$select public.call_panel_cron('/api/cron/webhooks')$$);
