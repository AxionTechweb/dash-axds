-- Base de alunos do Programa Active (importada de exportação manual da
-- plataforma) — usada para consulta/relatório, sem vínculo com area_id (não
-- é uma tabela multi-tenant, é uma cópia de referência de um único cliente).

create table public.alunos_programa (
  id                uuid primary key default gen_random_uuid(),
  nome              text,
  email             text not null,
  telefone          text,
  ativo             boolean not null default false,
  cadastro          date,
  ultimo_login      date,
  email_confirmado  boolean not null default false,
  banido            boolean not null default false,
  produtos          text,
  status_pagamento  text,
  ultima_compra     date,
  created_at        timestamptz not null default now()
);

create index alunos_programa_email_idx on public.alunos_programa (email);

alter table public.alunos_programa enable row level security;

drop policy if exists "authenticated read" on public.alunos_programa;
create policy "authenticated read" on public.alunos_programa
  for select to authenticated using (true);

grant select on public.alunos_programa to authenticated;
grant all on public.alunos_programa to service_role;
