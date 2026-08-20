-- =============================================================================
-- events_log — page_url, fbp, fbc
-- =============================================================================
-- Cliente com captura própria feita via GTM (não o track.js) manda esses três
-- campos extras no payload de /api/event: a URL da página onde o evento
-- aconteceu (útil pra jornada — em qual etapa do funil a pessoa estava) e os
-- cookies próprios da Meta (_fbp/_fbc), que o script deles já lê. Guardamos
-- como veio; este sistema não os reenvia a lugar nenhum (nada de CAPI aqui).
-- =============================================================================

alter table public.events_log
  add column if not exists page_url text,
  add column if not exists fbp text,
  add column if not exists fbc text;

-- A assinatura da função muda (3 parâmetros novos no fim) — dropar a antiga
-- explicitamente evita deixar um overload órfão no catalog.
drop function if exists public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.log_event(
  p_area_id      uuid,
  p_user_id      text,
  p_event_name   text,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_ip           text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null,
  p_page_url     text default null,
  p_fbp          text default null,
  p_fbc          text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitors%rowtype;
begin
  select * into v
  from public.visitors
  where area_id = p_area_id and user_id = p_user_id;

  insert into public.events_log (
    area_id, user_id, event_name,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    ip, geo_country, geo_region, geo_city,
    page_url, fbp, fbc
  )
  values (
    p_area_id, p_user_id, p_event_name,
    coalesce(p_utm_source,   v.utm_source),
    coalesce(p_utm_medium,   v.utm_medium),
    coalesce(p_utm_campaign, v.utm_campaign),
    coalesce(p_utm_term,     v.utm_term),
    coalesce(p_utm_content,  v.utm_content),
    p_ip,
    coalesce(p_geo_country, v.geo_country),
    coalesce(p_geo_region,  v.geo_region),
    coalesce(p_geo_city,    v.geo_city),
    p_page_url, p_fbp, p_fbc
  );
end;
$$;

-- Mesmo trancamento de acesso da 20260725120000_function_grants_lockdown.sql —
-- só o service_role (via createAdminClient()) executa.
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from anon, authenticated;

grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;
