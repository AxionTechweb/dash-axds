-- =====================================================================
-- SETUP COMPLETO DO BANCO — cole INTEIRO no SQL Editor do Supabase.
--
-- Alternativa à Supabase CLI (`npx supabase db push`) para quem prefere
-- não instalar/logar na CLI. Gera o schema 100% reproduzível: extensões,
-- funções, tabelas, RLS, rate limit, captura, realtime e checkout.
--
-- Rode UMA VEZ SÓ, num projeto Supabase novo e vazio.
-- Gerado a partir de supabase/migrations/ (ordem preservada). Mantenha em
-- sincronia: ao criar uma migration nova, regenere este arquivo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 20260721120000_extensions_and_functions.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Extensões e funções utilitárias
-- =============================================================================
-- pgcrypto: usado para cifrar/decifrar segredos de integração com uma chave
-- (ENCRYPTION_KEY) que vive SOMENTE no ambiente do servidor — nunca no banco.
-- A cifra/decifra acontece via funções abaixo, chamadas apenas pelo service_role
-- (servidor), passando a chave por parâmetro (corpo da requisição, sob TLS).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Trigger genérico para manter updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cifra/decifra de segredos (pgcrypto, chave simétrica passada pelo servidor).
-- O ciphertext é armazenado como TEXT base64 (colunas *_token / hottok), então
-- o servidor só troca strings com o banco (sem bytea via JSON).
--   - app_encrypt(plaintext, key) -> text base64
--   - app_decrypt(ciphertext_base64, key) -> text (somente no servidor)
-- STRICT: entrada NULL retorna NULL (token não configurado permanece NULL).
-- EXECUTE liberado apenas para service_role: decifra só acontece no servidor.
-- ---------------------------------------------------------------------------
create or replace function public.app_encrypt(plaintext text, key text)
returns text
language sql
strict
volatile
as $$
  select encode(extensions.pgp_sym_encrypt(plaintext, key), 'base64');
$$;

create or replace function public.app_decrypt(ciphertext text, key text)
returns text
language sql
strict
volatile
as $$
  select extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), key);
$$;

revoke all on function public.app_encrypt(text, text) from public;
revoke all on function public.app_decrypt(text, text) from public;
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;

-- ---------------------------------------------------------------------
-- 20260721120100_tables.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260721120200_rate_limit.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Rate limiting em Postgres (compatível com serverless / Vercel)
-- =============================================================================
-- Contador de janela fixa, atômico via UPSERT. Sem estado em memória.
-- Chamado pelos endpoints públicos (captura/webhooks) no servidor (service_role).
-- =============================================================================

create table public.rate_limit_counters (
  bucket_key   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

-- Retorna TRUE se a requisição está DENTRO do limite; FALSE se excedeu.
-- p_key: identificador do bucket (ex: "identify:<area>:<ip>")
-- p_max: máximo de hits por janela
-- p_window_seconds: tamanho da janela em segundos
create or replace function public.rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
    do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Limpeza de janelas antigas (chamar por Vercel Cron periodicamente).
create or replace function public.rate_limit_cleanup(p_older_than_seconds integer default 3600)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_counters
  where window_start < now() - make_interval(secs => p_older_than_seconds);
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_cleanup(integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;

-- ---------------------------------------------------------------------
-- 20260721120300_rls.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Row Level Security (single-tenant)
-- =============================================================================
-- Regra do painel: LEITURA só por usuário autenticado; ESCRITA só no servidor
-- (service_role, que faz BYPASS de RLS no Supabase). Cadastro público OFF.
-- `user_id` (visitante anônimo) NÃO entra em nenhuma política.
-- rate_limit_counters: RLS ligada e SEM policy => inacessível a anon/authenticated;
-- apenas o service_role (servidor) opera nela.
-- =============================================================================

-- Habilita RLS em TODAS as tabelas
alter table public.areas               enable row level security;
alter table public.branding            enable row level security;
alter table public.settings            enable row level security;
alter table public.meta_ad_accounts    enable row level security;
alter table public.visitors            enable row level security;
alter table public.events_log          enable row level security;
alter table public.purchases           enable row level security;
alter table public.automation_rules    enable row level security;
alter table public.rule_executions     enable row level security;
alter table public.audit_log           enable row level security;
alter table public.rate_limit_counters enable row level security;

-- Políticas de LEITURA para usuário autenticado (painel)
create policy "authenticated read" on public.areas
  for select to authenticated using (true);
create policy "authenticated read" on public.branding
  for select to authenticated using (true);
create policy "authenticated read" on public.settings
  for select to authenticated using (true);
create policy "authenticated read" on public.meta_ad_accounts
  for select to authenticated using (true);
create policy "authenticated read" on public.visitors
  for select to authenticated using (true);
create policy "authenticated read" on public.events_log
  for select to authenticated using (true);
create policy "authenticated read" on public.purchases
  for select to authenticated using (true);
create policy "authenticated read" on public.automation_rules
  for select to authenticated using (true);
create policy "authenticated read" on public.rule_executions
  for select to authenticated using (true);
create policy "authenticated read" on public.audit_log
  for select to authenticated using (true);
-- rate_limit_counters: sem policy de propósito (apenas service_role).

-- ---------------------------------------------------------------------------
-- Grants explícitos (reprodutíveis em qualquer projeto Supabase novo).
-- authenticated: apenas SELECT (a escrita é bloqueada por falta de policy).
-- service_role: acesso total (e bypass de RLS).
--
-- ATENÇÃO: os DEFAULT PRIVILEGES do Supabase concedem privilégios de TABELA a
-- anon/authenticated automaticamente. Ou seja, `anon` PODE ter INSERT/UPDATE/
-- DELETE aqui — quem efetivamente bloqueia é a RLS (habilitada em todas as
-- tabelas, com policy só de SELECT). Verificado num projeto real: um INSERT com
-- a chave anon responde "new row violates row-level security policy", e não
-- "permission denied for table" — prova de que o grant existe e a RLS é a
-- barreira. Não confie apenas nestes grants.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.areas, public.branding, public.settings, public.meta_ad_accounts,
  public.visitors, public.events_log, public.purchases,
  public.automation_rules, public.rule_executions, public.audit_log
to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- 20260722120000_capture.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 3 · Captura (snippet + /api/identify + /api/event)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Token público da área.
-- Vai no snippet das landing pages, então é VISÍVEL no fonte da página — NÃO é
-- um segredo. Serve apenas para dizer "de qual área é este hit". A proteção de
-- verdade é o CORS (allowed_origins da área) + rate limit.
-- ---------------------------------------------------------------------------
alter table public.areas
  add column public_token text not null unique
    default encode(extensions.gen_random_bytes(12), 'hex');

create index areas_public_token_idx on public.areas (public_token);

-- ---------------------------------------------------------------------------
-- UPSERT do visitante.
-- Semântica de UTM: LAST TOUCH — um valor novo sobrescreve o antigo, mas um
-- valor NULO (ex.: pageview interno sem UTM) NUNCA apaga o que já existe.
-- ---------------------------------------------------------------------------
create or replace function public.identify_visitor(
  p_area_id      uuid,
  p_user_id      text,
  p_email        text default null,
  p_telefone     text default null,
  p_nome         text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_referrer     text default null,
  p_ip           text default null,
  p_user_agent   text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.visitors (
    area_id, user_id, email, telefone, nome,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    referrer, ip, user_agent, geo_country, geo_region, geo_city
  )
  values (
    p_area_id, p_user_id, p_email, p_telefone, p_nome,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_referrer, p_ip, p_user_agent, p_geo_country, p_geo_region, p_geo_city
  )
  on conflict (area_id, user_id) do update set
    email        = coalesce(excluded.email,        public.visitors.email),
    telefone     = coalesce(excluded.telefone,     public.visitors.telefone),
    nome         = coalesce(excluded.nome,         public.visitors.nome),
    utm_source   = coalesce(excluded.utm_source,   public.visitors.utm_source),
    utm_medium   = coalesce(excluded.utm_medium,   public.visitors.utm_medium),
    utm_campaign = coalesce(excluded.utm_campaign, public.visitors.utm_campaign),
    utm_term     = coalesce(excluded.utm_term,     public.visitors.utm_term),
    utm_content  = coalesce(excluded.utm_content,  public.visitors.utm_content),
    referrer     = coalesce(excluded.referrer,     public.visitors.referrer),
    ip           = coalesce(excluded.ip,           public.visitors.ip),
    user_agent   = coalesce(excluded.user_agent,   public.visitors.user_agent),
    geo_country  = coalesce(excluded.geo_country,  public.visitors.geo_country),
    geo_region   = coalesce(excluded.geo_region,   public.visitors.geo_region),
    geo_city     = coalesce(excluded.geo_city,     public.visitors.geo_city);
$$;

-- ---------------------------------------------------------------------------
-- Registro de evento, ENRIQUECIDO com os dados do visitante quando o payload
-- não trouxer (ex.: pageview interno sem UTM herda a UTM de origem).
-- Este sistema apenas GRAVA — nada é disparado para plataformas externas.
-- ---------------------------------------------------------------------------
create or replace function public.log_event(
  p_area_id      uuid,
  p_user_id      text,
  p_event_name   text,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_ip           text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitors%rowtype;
begin
  select * into v
  from public.visitors
  where area_id = p_area_id and user_id = p_user_id;

  insert into public.events_log (
    area_id, user_id, event_name,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    ip, geo_country, geo_region, geo_city
  )
  values (
    p_area_id, p_user_id, p_event_name,
    coalesce(p_utm_source,   v.utm_source),
    coalesce(p_utm_medium,   v.utm_medium),
    coalesce(p_utm_campaign, v.utm_campaign),
    coalesce(p_utm_term,     v.utm_term),
    coalesce(p_utm_content,  v.utm_content),
    p_ip,
    coalesce(p_geo_country, v.geo_country),
    coalesce(p_geo_region,  v.geo_region),
    coalesce(p_geo_city,    v.geo_city)
  );
end;
$$;

-- Execução apenas pelo servidor (service_role).
revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------
-- 20260722130000_realtime.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 5 · Realtime do feed "Vendas em Tempo Real"
-- =============================================================================
-- Publica `purchases` no Realtime do Supabase para o feed do Dashboard.
-- A RLS continua valendo: só usuário AUTENTICADO recebe os eventos.
-- O painel tem fallback por polling caso o Realtime não esteja disponível.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchases'
  ) then
    alter publication supabase_realtime add table public.purchases;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 20260722140000_checkout_platforms.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Múltiplas plataformas de checkout
-- =============================================================================
-- Antes: `settings` tinha uma coluna de segredo por plataforma
-- (hotmart_hottok, kiwify_webhook_token). Isso não escala para 11 plataformas
-- — cada nova exigiria um ALTER TABLE.
--
-- Agora: uma linha por (área, plataforma) em `checkout_integrations`, com o
-- segredo cifrado do mesmo jeito (app_encrypt/app_decrypt, base64 TEXT).
-- Adicionar plataforma passa a ser só uma entrada no registro em
-- src/lib/checkout/platforms.ts — sem migration nova.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Integrações de checkout (N por área)
-- ---------------------------------------------------------------------------
create table if not exists public.checkout_integrations (
  area_id    uuid not null references public.areas(id) on delete cascade,
  plataforma text not null,
  secret     text,                                  -- cifrado (base64 pgcrypto)
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (area_id, plataforma)
);

create index if not exists checkout_integrations_area_idx
  on public.checkout_integrations (area_id);

drop trigger if exists set_checkout_integrations_updated_at
  on public.checkout_integrations;
create trigger set_checkout_integrations_updated_at
  before update on public.checkout_integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Migra os segredos que já existiam em `settings`
--    (idempotente: só insere o que estiver preenchido)
-- ---------------------------------------------------------------------------
insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'hotmart', hotmart_hottok
from public.settings
where hotmart_hottok is not null
on conflict (area_id, plataforma) do nothing;

insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'kiwify', kiwify_webhook_token
from public.settings
where kiwify_webhook_token is not null
on conflict (area_id, plataforma) do nothing;

alter table public.settings drop column if exists hotmart_hottok;
alter table public.settings drop column if exists kiwify_webhook_token;

-- ---------------------------------------------------------------------------
-- 3) `purchases.plataforma` passa a aceitar todas as plataformas suportadas.
--    A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
--    precisam andar juntos.
-- ---------------------------------------------------------------------------
alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) RLS — mesma regra do resto: leitura só para autenticado, escrita só
--    pelo servidor (service_role, que faz bypass).
-- ---------------------------------------------------------------------------
alter table public.checkout_integrations enable row level security;

drop policy if exists "authenticated read" on public.checkout_integrations;
create policy "authenticated read" on public.checkout_integrations
  for select to authenticated using (true);

grant select on public.checkout_integrations to authenticated;
grant all on public.checkout_integrations to service_role;

-- ---------------------------------------------------------------------
-- 20260725120000_function_grants_lockdown.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fecha o EXECUTE das funções para anon/authenticated.
--
-- CAUSA DO FURO: projetos Supabase trazem DEFAULT PRIVILEGES que concedem
-- EXECUTE em funções novas do schema `public` aos papéis `anon` e
-- `authenticated` EXPLICITAMENTE, por nome. As seções acima fazem apenas
-- `revoke all on function ... from public`, que remove o grant do pseudo-papel
-- PUBLIC — os grants explícitos a anon/authenticated sobrevivem.
--
-- VERIFICADO contra um projeto real (2026-07-25): com a chave anon era possível
-- executar app_encrypt, app_decrypt, rate_limit_hit, identify_visitor e
-- log_event. app_decrypt ainda exige a ENCRYPTION_KEY como argumento (que vive
-- só no env), mas identify_visitor/log_event são `security definer` e escrevem
-- furando a RLS — pulando CORS, zod e rate limit dos endpoints públicos.
--
-- Nenhuma dessas funções é chamada com a chave anon pelo app: todas passam por
-- createAdminClient() (service_role). Fechar o acesso não quebra nada.
-- =============================================================================

-- 1. Impede que funções FUTURAS do schema public nasçam abertas.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- 2. Fecha as funções que já existem.
revoke all on function public.app_encrypt(text, text)
  from anon, authenticated;
revoke all on function public.app_decrypt(text, text)
  from anon, authenticated;

revoke all on function public.rate_limit_hit(text, integer, integer)
  from anon, authenticated;
revoke all on function public.rate_limit_cleanup(integer)
  from anon, authenticated;

revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from anon, authenticated;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from anon, authenticated;

revoke all on function public.set_updated_at()
  from anon, authenticated;

-- 3. Reafirma quem PODE executar (idempotente).
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;
grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------
-- 20260801120000_add_payt_platform.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Adiciona a plataforma PayT ao checkout
-- =============================================================================
-- A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
-- precisam andar juntos. Ver a entrada "payt" no registro para os detalhes
-- do payload (confirmed: false — estrutura vista num payload real, mas ainda
-- sem venda de teste rodada por esta instalação).
-- =============================================================================

alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn', 'payt'
    )
  );

-- ---------------------------------------------------------------------
-- 20260803120000_purchase_payment_method.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Adiciona payment_method em purchases
-- =============================================================================
-- Método de pagamento da venda (cartão, PIX, boleto...), quando a plataforma
-- de checkout manda esse campo no webhook. Alimenta o recorte "Vendas por
-- Pagamento" do Dashboard. Nulo quando a plataforma não informa — não é erro.
-- =============================================================================

alter table public.purchases
  add column if not exists payment_method text;

-- ---------------------------------------------------------------------
-- 20260805120000_weekly_report.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260806120000_daily_campaign_checkpoints.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260810120000_fix_rate_columns_precision.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Corrige overflow em hook_rate/play_rate/pitch_retention
-- =============================================================================
-- Descoberto no primeiro cron real da semana: alguns criativos com poucas
-- sessões (1-5) tiveram play_rate ou over_pitch_rate EXATAMENTE 100% —
-- "numeric(6,4)" só suporta até 99.9999 (2 dígitos antes da vírgula), então
-- 100.0000 estourava e derrubava o upsert inteiro em creative_reports
-- (rowsWritten=0 silenciosamente, sem chegar a escrever no Sheets).
-- numeric(7,4) dá margem até 999.9999 — de sobra pra uma taxa que já é
-- limitada a 0–100 pela própria Vturb, só corrigindo o estouro no limite.
-- =============================================================================

alter table public.creative_reports
  alter column hook_rate       type numeric(7,4),
  alter column play_rate       type numeric(7,4),
  alter column pitch_retention type numeric(7,4);

-- ---------------------------------------------------------------------
-- 20260810130000_meta_account_currency.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Moeda da conta de anúncio da Meta
-- =============================================================================
-- Descoberto ao conectar uma conta em dólar ("USD 2"): os relatórios (semanal
-- e checkpoint diário) usam o `spend`/`revenue` cru que a Meta devolve, na
-- moeda DA CONTA — sem conversão (decisão do usuário: não converter câmbio).
-- Sem saber a moeda, esses números ficavam rotulados "(R$)" mesmo quando são
-- dólar. `currency` já vem em `discoverAdAccounts`/`testAdAccountConnection`
-- (Graph API) — só faltava persistir.
-- =============================================================================

alter table public.meta_ad_accounts
  add column if not exists currency text;

-- ---------------------------------------------------------------------
-- 20260818120000_ga4_landing_pages.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Histórico de migrations: faz um futuro `supabase db push` saber que
-- estas já foram aplicadas, evitando reaplicar tudo por cima.
-- ---------------------------------------------------------------------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260721120000', 'extensions_and_functions'),
  ('20260721120100', 'tables'),
  ('20260721120200', 'rate_limit'),
  ('20260721120300', 'rls'),
  ('20260722120000', 'capture'),
  ('20260722130000', 'realtime'),
  ('20260722140000', 'checkout_platforms'),
  ('20260725120000', 'function_grants_lockdown'),
  ('20260801120000', 'add_payt_platform'),
  ('20260803120000', 'purchase_payment_method'),
  ('20260805120000', 'weekly_report'),
  ('20260806120000', 'daily_campaign_checkpoints'),
  ('20260810120000', 'fix_rate_columns_precision'),
  ('20260810130000', 'meta_account_currency'),
  ('20260818120000', 'ga4_landing_pages')
on conflict (version) do nothing;

commit;
