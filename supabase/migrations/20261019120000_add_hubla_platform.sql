-- =============================================================================
-- Adiciona a plataforma Hubla ao checkout
-- =============================================================================
-- A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
-- precisam andar juntos. Ver a entrada "hubla" no registro para os detalhes
-- do payload (confirmed: false — estrutura vista na doc oficial
-- (hubla.gitbook.io/docs/webhooks), ainda sem venda de teste rodada por esta
-- instalação).
-- =============================================================================

alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn', 'payt', 'hubla'
    )
  );
