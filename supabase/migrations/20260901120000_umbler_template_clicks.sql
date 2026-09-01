-- Cliques em botão de template do WhatsApp — o campo já vem de graça na
-- mesma mensagem que o sync diário de templates (`buttons[].selected`),
-- validado contra mensagens reais antes de implementar.

alter table public.umbler_template_sends
  add column if not exists clicks integer not null default 0;
