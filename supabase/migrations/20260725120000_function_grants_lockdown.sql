-- =============================================================================
-- Fecha o EXECUTE das funções para anon/authenticated.
--
-- CAUSA DO FURO: projetos Supabase trazem DEFAULT PRIVILEGES que concedem
-- EXECUTE em funções novas do schema `public` aos papéis `anon` e
-- `authenticated` EXPLICITAMENTE, por nome. As migrations anteriores fizeram
-- apenas `revoke all on function ... from public`, que remove o grant do
-- pseudo-papel PUBLIC — os grants explícitos a anon/authenticated sobrevivem.
--
-- VERIFICADO contra um projeto real (2026-07-25): com a chave anon era possível
-- executar app_encrypt, app_decrypt, rate_limit_hit, identify_visitor e
-- log_event. app_decrypt ainda exige a ENCRYPTION_KEY como argumento (que vive
-- só no env), mas identify_visitor/log_event são `security definer` e escrevem
-- furando a RLS — pulando CORS, zod e rate limit dos endpoints públicos.
--
-- Nenhuma dessas funções é chamada com a chave anon pelo app: todas passam por
-- createAdminClient() (service_role). Fechar o acesso não quebra nada.
-- =============================================================================

-- 1. Impede que funções FUTURAS do schema public nasçam abertas.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- 2. Fecha as funções que já existem.
revoke all on function public.app_encrypt(text, text)
  from anon, authenticated;
revoke all on function public.app_decrypt(text, text)
  from anon, authenticated;

revoke all on function public.rate_limit_hit(text, integer, integer)
  from anon, authenticated;
revoke all on function public.rate_limit_cleanup(integer)
  from anon, authenticated;

revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from anon, authenticated;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from anon, authenticated;

revoke all on function public.set_updated_at()
  from anon, authenticated;

-- 3. Reafirma quem PODE executar (idempotente).
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;
grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;
