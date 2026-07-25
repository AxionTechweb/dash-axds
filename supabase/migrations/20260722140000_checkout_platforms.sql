-- =============================================================================
-- Múltiplas plataformas de checkout
-- =============================================================================
-- Antes: `settings` tinha uma coluna de segredo por plataforma
-- (hotmart_hottok, kiwify_webhook_token). Isso não escala para 11 plataformas
-- — cada nova exigiria um ALTER TABLE.
--
-- Agora: uma linha por (área, plataforma) em `checkout_integrations`, com o
-- segredo cifrado do mesmo jeito (app_encrypt/app_decrypt, base64 TEXT).
-- Adicionar plataforma passa a ser só uma entrada no registro em
-- src/lib/checkout/platforms.ts — sem migration nova.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Integrações de checkout (N por área)
-- ---------------------------------------------------------------------------
create table if not exists public.checkout_integrations (
  area_id    uuid not null references public.areas(id) on delete cascade,
  plataforma text not null,
  secret     text,                                  -- cifrado (base64 pgcrypto)
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (area_id, plataforma)
);

create index if not exists checkout_integrations_area_idx
  on public.checkout_integrations (area_id);

drop trigger if exists set_checkout_integrations_updated_at
  on public.checkout_integrations;
create trigger set_checkout_integrations_updated_at
  before update on public.checkout_integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Migra os segredos que já existiam em `settings`
--    (idempotente: só insere o que estiver preenchido)
-- ---------------------------------------------------------------------------
insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'hotmart', hotmart_hottok
from public.settings
where hotmart_hottok is not null
on conflict (area_id, plataforma) do nothing;

insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'kiwify', kiwify_webhook_token
from public.settings
where kiwify_webhook_token is not null
on conflict (area_id, plataforma) do nothing;

alter table public.settings drop column if exists hotmart_hottok;
alter table public.settings drop column if exists kiwify_webhook_token;

-- ---------------------------------------------------------------------------
-- 3) `purchases.plataforma` passa a aceitar todas as plataformas suportadas.
--    A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
--    precisam andar juntos.
-- ---------------------------------------------------------------------------
alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) RLS — mesma regra do resto: leitura só para autenticado, escrita só
--    pelo servidor (service_role, que faz bypass).
-- ---------------------------------------------------------------------------
alter table public.checkout_integrations enable row level security;

drop policy if exists "authenticated read" on public.checkout_integrations;
create policy "authenticated read" on public.checkout_integrations
  for select to authenticated using (true);

grant select on public.checkout_integrations to authenticated;
grant all on public.checkout_integrations to service_role;
