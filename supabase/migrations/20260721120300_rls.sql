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
-- ATENÇÃO: os DEFAULT PRIVILEGES do Supabase concedem privilégios de TABELA a
-- anon/authenticated automaticamente. Quem efetivamente bloqueia a escrita é a
-- RLS, não a ausência de grant. Ver 20260725120000_function_grants_lockdown.sql.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.areas, public.branding, public.settings, public.meta_ad_accounts,
  public.visitors, public.events_log, public.purchases,
  public.automation_rules, public.rule_executions, public.audit_log
to authenticated;

grant all on all tables in schema public to service_role;
