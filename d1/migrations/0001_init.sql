-- =============================================================================
-- Schema D1 (SQLite) — tradução das migrations do Supabase (supabase/migrations).
-- Fonte deste arquivo → scripts/build-d1-schema.mjs → d1/migrations/0001_init.sql
-- e src/lib/db/schema-meta.ts (tipos das colunas usados pela camada de dados).
-- Tipos: uuid/timestamptz/date → TEXT (ISO-8601 UTC "…Z"), numeric → REAL,
-- boolean → INTEGER 0/1, jsonb/text[] → TEXT com JSON. Sem RLS: o controle de
-- acesso é no servidor (o painel exige sessão; escrita só no servidor).
-- Marcadores lidos pelo gerador:      
-- CHECK de plataforma/status de purchases fica no código (PLATFORM_IDS), pois o
-- SQLite não altera CHECK sem recriar a tabela.
-- =============================================================================

create table areas (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  nome text not null,
  revenue_goal real not null default 0,
  public_token text not null unique default (lower(hex(randomblob(12)))),
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table branding (
  id integer  primary key default 1 check (id = 1),
  product_name text not null default 'Dashboard',
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color_override text,
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table settings (
  area_id text primary key references areas(id) on delete cascade,
  currency text not null default 'BRL',
  tax_rate real not null default 0,
  revenue_goal real not null default 0,
  allowed_origins text  not null default '[]',
  gateway_fee_pct real not null default 0,
  gateway_fee_fixed real not null default 0,
  break_even_value real not null default 0,
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table meta_ad_accounts (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  label text not null,
  ad_account_id text not null,
  ads_token text,
  currency text,
  last_known_status integer,
  alerts_muted integer  not null default 0,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index meta_ad_accounts_area_id_idx on meta_ad_accounts (area_id);

create table visitors (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  user_id text not null,
  email text,
  telefone text,
  nome text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  ip text,
  user_agent text,
  geo_country text,
  geo_region text,
  geo_city text,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, user_id)
);
create index visitors_user_id_idx on visitors (user_id);
create index visitors_created_at_idx on visitors (created_at);
create index visitors_email_idx on visitors (email);
create index visitors_telefone_idx on visitors (telefone);

create table events_log (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  user_id text not null,
  event_name text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ip text,
  geo_country text,
  geo_region text,
  geo_city text,
  page_url text,
  fbp text,
  fbc text,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index events_log_user_id_idx on events_log (user_id);
create index events_log_created_at_idx on events_log (created_at);
create index events_log_area_event_created_idx on events_log (area_id, event_name, created_at);

create table purchases (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  transaction_id text not null unique,
  user_id text,
  email text,
  telefone text,
  produto text,
  valor real,
  moeda text,
  status text not null,
  plataforma text not null,
  payment_method text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ad_id text,
  geo_country text,
  geo_region text,
  geo_city text,
  match text,
  raw_webhook text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index purchases_ad_id_idx on purchases (ad_id);
create index purchases_user_id_idx on purchases (user_id);
create index purchases_email_idx on purchases (email);
create index purchases_telefone_idx on purchases (telefone);
create index purchases_area_created_idx on purchases (area_id, created_at);
create index purchases_area_status_created_idx on purchases (area_id, status, created_at);

create table automation_rules (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  nome text not null,
  nivel text not null check (nivel in ('campanha','conjunto','anuncio')),
  metric text not null,
  operator text not null check (operator in ('>','<')),
  value real not null,
  period text not null,
  action text not null check (action in ('pausar','notificar')),
  ativa integer  not null default 1,
  last_run text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index automation_rules_area_id_idx on automation_rules (area_id);

create table rule_executions (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  rule_id text not null references automation_rules(id) on delete cascade,
  ran_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  matched integer  not null,
  action_taken text,
  target_level text,
  target_id text,
  details text 
);
create index rule_executions_area_id_idx on rule_executions (area_id);
create index rule_executions_rule_id_idx on rule_executions (rule_id);
create index rule_executions_ran_at_idx on rule_executions (ran_at);

create table audit_log (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text references areas(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index audit_log_area_id_idx on audit_log (area_id);
create index audit_log_created_at_idx on audit_log (created_at);
create index audit_log_action_idx on audit_log (action);

create table rate_limit_counters (
  bucket_key text not null,
  window_start text  not null,
  count integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limit_counters_window_idx on rate_limit_counters (window_start);

create table checkout_integrations (
  area_id text not null references areas(id) on delete cascade,
  plataforma text not null,
  secret text,
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (area_id, plataforma)
);

create table product_tiers (
  area_id text not null references areas(id) on delete cascade,
  produto text not null,
  tier text not null default 'outro' check (tier in ('vd','upsell','downsell','outro')),
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (area_id, produto)
);

create table vturb_integrations (
  area_id text primary key references areas(id) on delete cascade,
  api_key text,
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table vturb_players (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  player_id text not null,
  label text not null,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, player_id)
);

create table google_sheets_integrations (
  area_id text primary key references areas(id) on delete cascade,
  spreadsheet_id text not null,
  service_account_json text,
  template_tab_name text not null default 'TEMPLATE',
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table creative_reports (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  week_start text not null,
  week_end text not null,
  account_id text,
  account_label text,
  ad_id text not null,
  ad_name text,
  campaign_id text,
  campaign_name text,
  status text,
  spend real not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  page_views integer not null default 0,
  initiate_checkout integer not null default 0,
  meta_purchases integer not null default 0,
  meta_revenue real not null default 0,
  vturb_player_id text,
  hook_rate real,
  play_rate real,
  plays integer,
  pitch_retention real,
  cta_clicks integer,
  sales_vd integer not null default 0,
  revenue_vd real not null default 0,
  sales_upsell integer not null default 0,
  revenue_upsell real not null default 0,
  sales_downsell integer not null default 0,
  revenue_downsell real not null default 0,
  sales_total integer not null default 0,
  revenue_total real not null default 0,
  roas real,
  cac real,
  net_margin real,
  delta_meta_vs_own integer,
  spend_usd real,
  vturb_views integer,
  vturb_unique_views integer,
  vturb_conversions integer,
  vturb_revenue real,
  retention_25 real,
  retention_50 real,
  retention_75 real,
  avg_watch_seconds real,
  refund_value real not null default 0,
  chargeback_value real not null default 0,
  canceled_count integer not null default 0,
  unique_buyers integer not null default 0,
  cpa real,
  net_revenue real,
  profit_margin_pct real,
  rpv real,
  arpu real,
  conversion_rate real,
  pv_ic_rate real,
  checkout_rate real,
  ticket_medio real,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, week_start, ad_id)
);

create table weekly_report_runs (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  week_start text not null,
  week_end text not null,
  sheet_tab_name text,
  status text not null check (status in ('ok','error')),
  error text,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, week_start)
);

create table daily_campaign_sheets (
  area_id text primary key references areas(id) on delete cascade,
  spreadsheet_id text not null,
  service_account_json text,
  template_tab_name text not null default 'TEMPLATE',
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table daily_campaign_checkpoints (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  day text not null,
  campaign_id text not null,
  campaign_name text,
  horario integer not null,
  sheet_tab_name text,
  spend real not null default 0,
  revenue real not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  page_views integer not null default 0,
  initiate_checkout integer not null default 0,
  sales integer not null default 0,
  status text not null check (status in ('ok','error')),
  error text,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, day, campaign_id, horario)
);

create table ga4_integrations (
  area_id text primary key references areas(id) on delete cascade,
  property_id text not null,
  service_account_json text,
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table ga4_landing_pages (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  day text not null,
  landing_page text not null,
  sessions integer not null default 0,
  active_users integer not null default 0,
  new_users integer not null default 0,
  avg_engagement_seconds real,
  key_events integer not null default 0,
  total_revenue real not null default 0,
  key_event_rate real,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, day, landing_page)
);

create table ga4_session_sources (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  day text not null,
  source text not null,
  active_users integer not null default 0,
  sessions integer not null default 0,
  engaged_sessions integer not null default 0,
  avg_engagement_seconds real,
  engaged_sessions_per_user real,
  events_per_session real,
  engagement_rate real,
  key_events integer not null default 0,
  event_count integer not null default 0,
  total_revenue real not null default 0,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, day, source)
);

create table ga4_source_mediums (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  day text not null,
  source_medium text not null,
  sessions integer not null default 0,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, day, source_medium)
);

create table whatsapp_integrations (
  area_id text primary key references areas(id) on delete cascade,
  base_url text not null,
  instance text not null,
  api_key text not null,
  target_number text not null,
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table alert_state (
  area_id text not null references areas(id) on delete cascade,
  alert_type text not null,
  last_alerted_at text ,
  last_state text ,
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (area_id, alert_type)
);

create table support_ai_sessions (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  chat_id text not null,
  contact_phone text,
  mode text not null default 'ai',
  escalation_reason text,
  last_customer_message_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, chat_id)
);

create table meta_wa_integrations (
  area_id text primary key references areas(id) on delete cascade,
  access_token text not null,
  waba_id text not null,
  phone_number_id text not null,
  display_phone text,
  enabled integer  not null default 1,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table wa_dispatch_rules (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  trigger text not null check (trigger in ('approved','waiting_payment','abandoned','lead')),
  template_name text not null,
  template_language text not null default 'pt_BR',
  body_params text  not null default '[]',
  delay_minutes integer not null default 0 check (delay_minutes >= 0 and delay_minutes <= 10080),
  enabled integer  not null default 0,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, trigger)
);

create table api_campaigns (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  label text not null,
  template_name text not null,
  template_language text not null,
  total integer not null,
  scheduled_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at text ,
  canceled_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index api_campaigns_area_created_idx on api_campaigns (area_id, created_at);

create table wa_dispatch_log (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  rule_id text references wa_dispatch_rules(id) on delete set null,
  campaign_id text references api_campaigns(id) on delete set null,
  trigger text not null check (trigger in ('approved','waiting_payment','abandoned','lead','manual')),
  campaign_label text,
  source_ref text,
  telefone text not null,
  template_name text not null,
  template_language text not null default 'pt_BR',
  params text  not null default '[]',
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  error text,
  wamid text,
  scheduled_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at text ,
  claimed_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index wa_dispatch_log_rule_source_uidx on wa_dispatch_log (rule_id, source_ref)
  where rule_id is not null and source_ref is not null;
create index wa_dispatch_log_queue_idx on wa_dispatch_log (status, scheduled_at);
create index wa_dispatch_log_area_created_idx on wa_dispatch_log (area_id, created_at);
create index wa_dispatch_log_phone_idx on wa_dispatch_log (area_id, telefone, created_at);
create index wa_dispatch_log_campaign_idx on wa_dispatch_log (campaign_id, status);

create table wa_optouts (
  area_id text not null references areas(id) on delete cascade,
  telefone text not null,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (area_id, telefone)
);

create table api_credentials (
  area_id text primary key references areas(id) on delete cascade,
  api_key text not null unique,
  secret_hash text not null,
  webhook_url text,
  webhook_secret text,
  webhook_events text  not null default '["message.sent","message.failed","message.skipped","campaign.finished"]',
  webhook_enabled integer  not null default 1,
  webhook_failures integer not null default 0,
  last_used_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table api_webhook_deliveries (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  event text not null,
  payload text  not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts integer not null default 0,
  next_attempt_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_status integer,
  last_error text,
  delivered_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index api_webhook_deliveries_queue_idx on api_webhook_deliveries (status, next_attempt_at);
create index api_webhook_deliveries_area_idx on api_webhook_deliveries (area_id, created_at);

-- -----------------------------------------------------------------------------
-- Login do painel (substitui o Supabase Auth). Senhas em bcrypt: o hash
-- importado do auth.users do Supabase continua válido, ninguém troca senha.
-- -----------------------------------------------------------------------------
create table auth_users (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  email text not null unique collate nocase,
  password_hash text,
  user_metadata text  not null default '{}',
  email_confirmed_at text ,
  last_sign_in_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- id = SHA-256 do token (o token em claro só existe no cookie / no link).
create table auth_sessions (
  id text primary key,
  user_id text not null references auth_users(id) on delete cascade,
  kind text not null default 'session' check (kind in ('session','recovery')),
  expires_at text  not null,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index auth_sessions_user_idx on auth_sessions (user_id);

create table auth_tokens (
  id text primary key,
  user_id text not null references auth_users(id) on delete cascade,
  kind text not null check (kind in ('recovery','invite')),
  expires_at text  not null,
  used_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table push_subscriptions (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  user_id text not null references auth_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_success_at text 
);
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- updated_at automático
create trigger branding_set_updated_at after update on branding
for each row when new.updated_at is old.updated_at begin
  update branding set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger settings_set_updated_at after update on settings
for each row when new.updated_at is old.updated_at begin
  update settings set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger meta_ad_accounts_set_updated_at after update on meta_ad_accounts
for each row when new.updated_at is old.updated_at begin
  update meta_ad_accounts set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger visitors_set_updated_at after update on visitors
for each row when new.updated_at is old.updated_at begin
  update visitors set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger purchases_set_updated_at after update on purchases
for each row when new.updated_at is old.updated_at begin
  update purchases set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger automation_rules_set_updated_at after update on automation_rules
for each row when new.updated_at is old.updated_at begin
  update automation_rules set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger checkout_integrations_set_updated_at after update on checkout_integrations
for each row when new.updated_at is old.updated_at begin
  update checkout_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger product_tiers_set_updated_at after update on product_tiers
for each row when new.updated_at is old.updated_at begin
  update product_tiers set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger vturb_integrations_set_updated_at after update on vturb_integrations
for each row when new.updated_at is old.updated_at begin
  update vturb_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger google_sheets_integrations_set_updated_at after update on google_sheets_integrations
for each row when new.updated_at is old.updated_at begin
  update google_sheets_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger daily_campaign_sheets_set_updated_at after update on daily_campaign_sheets
for each row when new.updated_at is old.updated_at begin
  update daily_campaign_sheets set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger ga4_integrations_set_updated_at after update on ga4_integrations
for each row when new.updated_at is old.updated_at begin
  update ga4_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger whatsapp_integrations_set_updated_at after update on whatsapp_integrations
for each row when new.updated_at is old.updated_at begin
  update whatsapp_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger alert_state_set_updated_at after update on alert_state
for each row when new.updated_at is old.updated_at begin
  update alert_state set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger support_ai_sessions_set_updated_at after update on support_ai_sessions
for each row when new.updated_at is old.updated_at begin
  update support_ai_sessions set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger meta_wa_integrations_set_updated_at after update on meta_wa_integrations
for each row when new.updated_at is old.updated_at begin
  update meta_wa_integrations set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger wa_dispatch_rules_set_updated_at after update on wa_dispatch_rules
for each row when new.updated_at is old.updated_at begin
  update wa_dispatch_rules set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger api_credentials_set_updated_at after update on api_credentials
for each row when new.updated_at is old.updated_at begin
  update api_credentials set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

create trigger auth_users_set_updated_at after update on auth_users
for each row when new.updated_at is old.updated_at begin
  update auth_users set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;
