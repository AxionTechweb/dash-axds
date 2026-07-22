-- =============================================================================
-- Fase 5 · Realtime do feed "Vendas em Tempo Real"
-- =============================================================================
-- Publica `purchases` no Realtime do Supabase para o feed do Dashboard.
-- A RLS continua valendo: só usuário AUTENTICADO recebe os eventos.
-- O painel tem fallback por polling caso o Realtime não esteja disponível.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchases'
  ) then
    alter publication supabase_realtime add table public.purchases;
  end if;
end
$$;
