-- Deduplicação de eventos "Message" da Umbler Talk — ela pode reenviar o
-- mesmo evento mais de uma vez (retry, múltiplos webhooks configurados,
-- etc.), e sem essa checagem a IA respondia a mesma mensagem várias vezes.
alter table public.support_ai_sessions
  add column if not exists last_event_id text;
