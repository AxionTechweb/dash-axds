-- Envio INDIVIDUAL de template (telefone + horário + botão clicado), pra dar
-- pra calcular: (1) taxa de clique num botão ESPECÍFICO (ex.: "Liberar
-- acesso" do compra_aprovada), não só "clicou em algum botão" como a tabela
-- umbler_template_sends já fazia; (2) taxa de conversão de templates de
-- recuperação de carrinho, cruzando com uma compra aprovada depois do envio.
--
-- Alimentada pelo MESMO cron diário que já lê as mensagens de cada chat pra
-- preencher umbler_template_sends — sem chamada extra na API da Umbler, só
-- mais uma linha gravada por envio de template encontrado.
create table public.umbler_template_events (
  id              uuid primary key default gen_random_uuid(),
  area_id         uuid not null references public.areas(id) on delete cascade,
  message_id      text not null,
  chat_id         text not null,
  contact_phone   text,
  template_id     text not null,
  template_label  text,
  button_clicked  text,
  sent_at         timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (area_id, message_id)
);

create index umbler_template_events_area_label_idx
  on public.umbler_template_events (area_id, template_label);

create index umbler_template_events_area_phone_idx
  on public.umbler_template_events (area_id, contact_phone);

alter table public.umbler_template_events enable row level security;

create policy "authenticated read" on public.umbler_template_events
  for select to authenticated using (true);

grant select on public.umbler_template_events to authenticated;
grant all on public.umbler_template_events to service_role;
