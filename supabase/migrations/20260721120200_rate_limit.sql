-- =============================================================================
-- Fase 1 · Rate limiting em Postgres (compatível com serverless / Vercel)
-- =============================================================================
-- Contador de janela fixa, atômico via UPSERT. Sem estado em memória.
-- Chamado pelos endpoints públicos (captura/webhooks) no servidor (service_role).
-- =============================================================================

create table public.rate_limit_counters (
  bucket_key   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

-- Retorna TRUE se a requisição está DENTRO do limite; FALSE se excedeu.
-- p_key: identificador do bucket (ex: "identify:<area>:<ip>")
-- p_max: máximo de hits por janela
-- p_window_seconds: tamanho da janela em segundos
create or replace function public.rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
    do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Limpeza de janelas antigas (chamar por Vercel Cron periodicamente).
create or replace function public.rate_limit_cleanup(p_older_than_seconds integer default 3600)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_counters
  where window_start < now() - make_interval(secs => p_older_than_seconds);
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_cleanup(integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;
