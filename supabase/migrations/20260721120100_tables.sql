-- =============================================================================
-- Fase 1 · Tabelas do domínio
-- =============================================================================
-- IDENTIDADE: `user_id` é o ID ANÔNIMO do visitante (nanoid), gerado pelo sistema.
-- NÃO tem relação com auth.users e NÃO possui FK para auth.users.
-- MULTI-ÁREA: quase todas as tabelas têm area_id (indexado). Branding é global.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Áreas (workspaces)
-- ---------------------------------------------------------------------------
create table public.areas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  revenue_goal numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Branding (GLOBAL da instância — linha única forçada por id boolean = true)
-- Defaults NEUTROS (white label). Sempre existe exatamente uma linha.
-- ---------------------------------------------------------------------------
create table public.branding (
  id                     boolean primary key default true,
  product_name           text not null default 'Dashboard',
  logo_light_url         text,
  logo_dark_url          text,
  favicon_url            text,
  primary_color_override text,          -- HSL sem função, ex: "142 76% 58%"
  updated_at             timestamptz not null default now(),
  constraint branding_singleton check (id = true)
);
insert into public.branding (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Settings (uma linha por área). Segredos cifrados em bytea (pgcrypto).
-- ---------------------------------------------------------------------------
create table public.settings (
  area_id              uuid primary key references public.areas(id) on delete cascade,
  currency             text not null default 'BRL',
  tax_rate             numeric(5,2) not null default 0,      -- alíquota de imposto (%)
  revenue_goal         numeric(14,2) not null default 0,     -- meta operacional da área
  allowed_origins      text[] not null default '{}',         -- CORS das landing pages
  hotmart_hottok       text,                                 -- cifrado (base64 pgcrypto)
  kiwify_webhook_token text,                                 -- cifrado (base64 pgcrypto)
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contas de anúncio da Meta (N por área). ads_token cifrado (System User).
-- ---------------------------------------------------------------------------
create table public.meta_ad_accounts (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas(id) on delete cascade,
  label         text not null,
  ad_account_id text not null,        -- "act_<numeric>" ou numérico
  ads_token     text,                 -- cifrado (base64 pgcrypto); ads_read + ads_management
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meta_ad_accounts_area_id_idx on public.meta_ad_accounts (area_id);

-- ---------------------------------------------------------------------------
-- Visitors (visitante anônimo rastreado). user_id único por área.
-- LGPD: só email/telefone/nome em claro, apenas para o match de compra.
-- ---------------------------------------------------------------------------
create table public.visitors (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  user_id      text not null,
  email        text,
  telefone     text,
  nome         text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  referrer     text,
  ip           text,
  user_agent   text,
  geo_country  text,
  geo_region   text,
  geo_city     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (area_id, user_id)
);
create index visitors_area_id_idx    on public.visitors (area_id);
create index visitors_user_id_idx    on public.visitors (user_id);
create index visitors_created_at_idx on public.visitors (created_at);
create index visitors_email_idx      on public.visitors (email);
create index visitors_telefone_idx   on public.visitors (telefone);

-- ---------------------------------------------------------------------------
-- Events log (page_view, initiate_checkout, ...). Só grava (nada sai pra fora).
-- Para checkouts, o ad_id trafega em utm_content.
-- ---------------------------------------------------------------------------
create table public.events_log (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  user_id      text not null,
  event_name   text not null,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  ip           text,
  geo_country  text,
  geo_region   text,
  geo_city     text,
  created_at   timestamptz not null default now()
);
create index events_log_area_id_idx    on public.events_log (area_id);
create index events_log_user_id_idx    on public.events_log (user_id);
create index events_log_event_name_idx on public.events_log (event_name);
create index events_log_created_at_idx on public.events_log (created_at);

-- ---------------------------------------------------------------------------
-- Purchases (compras via webhook). UPSERT idempotente por transaction_id.
-- ad_id em coluna própria (indexada), validado como numérico na aplicação.
-- status: unificado interno. plataforma: hotmart | kiwify.
-- ---------------------------------------------------------------------------
create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas(id) on delete cascade,
  transaction_id text not null unique,
  user_id        text,
  email          text,
  telefone       text,
  produto        text,
  valor          numeric(14,2),
  moeda          text,
  status         text not null check (status in ('approved','pending','refunded','chargeback','canceled')),
  plataforma     text not null check (plataforma in ('hotmart','kiwify')),
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_term       text,
  utm_content    text,
  ad_id          text,
  geo_country    text,
  geo_region     text,
  geo_city       text,
  match          text,                 -- como casou (user_id / email / telefone / none)
  raw_webhook    jsonb,                -- payload bruto para auditoria
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index purchases_area_id_idx    on public.purchases (area_id);
create index purchases_ad_id_idx      on public.purchases (ad_id);
create index purchases_status_idx     on public.purchases (status);
create index purchases_plataforma_idx on public.purchases (plataforma);
create index purchases_user_id_idx    on public.purchases (user_id);
create index purchases_created_at_idx on public.purchases (created_at);
create index purchases_email_idx      on public.purchases (email);
create index purchases_telefone_idx   on public.purchases (telefone);

-- ---------------------------------------------------------------------------
-- Automation rules (página Regras) + histórico de execuções
-- ---------------------------------------------------------------------------
create table public.automation_rules (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.areas(id) on delete cascade,
  nome       text not null,
  nivel      text not null check (nivel in ('campanha','conjunto','anuncio')),
  metric     text not null,
  operator   text not null check (operator in ('>','<')),
  value      numeric not null,
  period     text not null,                         -- ex: 'today','7d','30d'
  action     text not null check (action in ('pausar','notificar')),
  ativa      boolean not null default true,
  last_run   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_rules_area_id_idx on public.automation_rules (area_id);

create table public.rule_executions (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  rule_id      uuid not null references public.automation_rules(id) on delete cascade,
  ran_at       timestamptz not null default now(),
  matched      boolean not null,
  action_taken text,
  target_level text,
  target_id    text,
  details      jsonb
);
create index rule_executions_area_id_idx on public.rule_executions (area_id);
create index rule_executions_rule_id_idx on public.rule_executions (rule_id);
create index rule_executions_ran_at_idx  on public.rule_executions (ran_at);

-- ---------------------------------------------------------------------------
-- Audit log (escritas na Meta, execuções de regras, mudanças de config)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid references public.areas(id) on delete set null,
  actor_email text,                    -- usuário do painel (null para cron/sistema)
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_area_id_idx    on public.audit_log (area_id);
create index audit_log_created_at_idx on public.audit_log (created_at);
create index audit_log_action_idx     on public.audit_log (action);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
create trigger branding_set_updated_at
  before update on public.branding
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();
create trigger meta_ad_accounts_set_updated_at
  before update on public.meta_ad_accounts
  for each row execute function public.set_updated_at();
create trigger visitors_set_updated_at
  before update on public.visitors
  for each row execute function public.set_updated_at();
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();
