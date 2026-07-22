-- =============================================================================
-- Fase 3 · Captura (snippet + /api/identify + /api/event)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Token público da área.
-- Vai no snippet das landing pages, então é VISÍVEL no fonte da página — NÃO é
-- um segredo. Serve apenas para dizer "de qual área é este hit". A proteção de
-- verdade é o CORS (allowed_origins da área) + rate limit.
-- ---------------------------------------------------------------------------
alter table public.areas
  add column public_token text not null unique
    default encode(extensions.gen_random_bytes(12), 'hex');

create index areas_public_token_idx on public.areas (public_token);

-- ---------------------------------------------------------------------------
-- UPSERT do visitante.
-- Semântica de UTM: LAST TOUCH — um valor novo sobrescreve o antigo, mas um
-- valor NULO (ex.: pageview interno sem UTM) NUNCA apaga o que já existe.
-- ---------------------------------------------------------------------------
create or replace function public.identify_visitor(
  p_area_id      uuid,
  p_user_id      text,
  p_email        text default null,
  p_telefone     text default null,
  p_nome         text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_referrer     text default null,
  p_ip           text default null,
  p_user_agent   text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.visitors (
    area_id, user_id, email, telefone, nome,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    referrer, ip, user_agent, geo_country, geo_region, geo_city
  )
  values (
    p_area_id, p_user_id, p_email, p_telefone, p_nome,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_referrer, p_ip, p_user_agent, p_geo_country, p_geo_region, p_geo_city
  )
  on conflict (area_id, user_id) do update set
    email        = coalesce(excluded.email,        public.visitors.email),
    telefone     = coalesce(excluded.telefone,     public.visitors.telefone),
    nome         = coalesce(excluded.nome,         public.visitors.nome),
    utm_source   = coalesce(excluded.utm_source,   public.visitors.utm_source),
    utm_medium   = coalesce(excluded.utm_medium,   public.visitors.utm_medium),
    utm_campaign = coalesce(excluded.utm_campaign, public.visitors.utm_campaign),
    utm_term     = coalesce(excluded.utm_term,     public.visitors.utm_term),
    utm_content  = coalesce(excluded.utm_content,  public.visitors.utm_content),
    referrer     = coalesce(excluded.referrer,     public.visitors.referrer),
    ip           = coalesce(excluded.ip,           public.visitors.ip),
    user_agent   = coalesce(excluded.user_agent,   public.visitors.user_agent),
    geo_country  = coalesce(excluded.geo_country,  public.visitors.geo_country),
    geo_region   = coalesce(excluded.geo_region,   public.visitors.geo_region),
    geo_city     = coalesce(excluded.geo_city,     public.visitors.geo_city);
$$;

-- ---------------------------------------------------------------------------
-- Registro de evento, ENRIQUECIDO com os dados do visitante quando o payload
-- não trouxer (ex.: pageview interno sem UTM herda a UTM de origem).
-- Este sistema apenas GRAVA — nada é disparado para plataformas externas.
-- ---------------------------------------------------------------------------
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
  p_geo_city     text default null
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
    ip, geo_country, geo_region, geo_city
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
    coalesce(p_geo_city,    v.geo_city)
  );
end;
$$;

-- Execução apenas pelo servidor (service_role).
revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;
