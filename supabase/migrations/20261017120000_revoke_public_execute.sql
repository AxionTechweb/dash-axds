-- Funções novas nascem com EXECUTE para PUBLIC. A 20260820 recriou log_event
-- (security definer) e revogou só de anon/authenticated — o acesso continuava
-- vindo via PUBLIC, então qualquer um com a anon key gravava eventos em
-- qualquer área, sem passar por CORS/rate limit. Só o service_role executa.
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
