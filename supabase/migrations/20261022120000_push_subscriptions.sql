-- Notificações push (PWA): cada aparelho/navegador que ativou o sino no
-- painel vira uma linha aqui. Painel single-tenant: todo aviso vai para todos
-- os aparelhos inscritos. Escrita só pelo servidor (service_role); o usuário
-- logado só enxerga e remove os próprios.
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- Resumo diário das 18h (horário de São Paulo = 21:00 UTC).
select cron.schedule('panel-daily-summary', '0 21 * * *', $$select public.call_panel_cron('/api/cron/daily-summary')$$);
