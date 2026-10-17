-- Crons que a Vercel (plano Hobby, 1x/dia) não consegue rodar na frequência
-- certa passam a ser chamados pelo pg_cron do Supabase, com o mesmo
-- Authorization: Bearer $CRON_SECRET das rotas.
--
-- PRÉ-REQUISITO (não versionado, é segredo): o valor do CRON_SECRET da Vercel
-- guardado no Vault com o nome 'cron_secret':
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Trocou o CRON_SECRET na Vercel? Atualize o Vault também:
--   select vault.update_secret(id, '<novo>') from vault.secrets where name = 'cron_secret';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_panel_cron(p_path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_get(
    url := 'https://dash-axion.vercel.app' || p_path,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.call_panel_cron(text) from public, anon, authenticated;

-- Disparos com atraso (PIX pendente, abandono, lead): a cada 5 min.
select cron.schedule('panel-dispatch', '*/5 * * * *', $$select public.call_panel_cron('/api/cron/dispatch')$$);
-- Avisos (conta desativada, anúncio reprovado, PIX travado, sem venda): a cada 15 min.
select cron.schedule('panel-alerts', '*/15 * * * *', $$select public.call_panel_cron('/api/cron/alerts')$$);
-- Checkpoint intradia por campanha: de hora em hora (a rota decide os horários).
select cron.schedule('panel-daily-campaigns', '2 * * * *', $$select public.call_panel_cron('/api/cron/daily-campaigns')$$);
-- Regras automáticas: de hora em hora (antes 1x/dia às 06:00 pela Vercel).
select cron.schedule('panel-rules', '7 * * * *', $$select public.call_panel_cron('/api/cron/rules')$$);
