-- Agente de suporte no WhatsApp (Umbler Talk + Claude) — Fase 1.
-- Guarda em que modo cada conversa está ('ai' | 'human'). Sem tabela de
-- mensagens: o histórico completo já vive na própria Umbler Talk e é lido
-- sob demanda (mesmo endpoint que o sync diário de templates já usa).

create table public.support_ai_sessions (
  id                        uuid primary key default gen_random_uuid(),
  area_id                   uuid not null references public.areas(id) on delete cascade,
  chat_id                   text not null,
  contact_phone             text,
  mode                      text not null default 'ai',   -- 'ai' | 'human'
  escalation_reason         text,
  last_customer_message_at  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (area_id, chat_id)
);

create index support_ai_sessions_area_idx
  on public.support_ai_sessions (area_id);

alter table public.support_ai_sessions enable row level security;

drop policy if exists "authenticated read" on public.support_ai_sessions;
create policy "authenticated read" on public.support_ai_sessions
  for select to authenticated using (true);

grant select on public.support_ai_sessions to authenticated;
grant all on public.support_ai_sessions to service_role;

create trigger set_updated_at
  before update on public.support_ai_sessions
  for each row execute function public.set_updated_at();
