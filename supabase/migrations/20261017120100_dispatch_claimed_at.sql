-- Hora em que o envio começou: permite achar linhas presas em "sending"
-- (função caiu no meio) sem confundir com linhas antigas recém-pegas.
alter table public.wa_dispatch_log add column if not exists claimed_at timestamptz;
