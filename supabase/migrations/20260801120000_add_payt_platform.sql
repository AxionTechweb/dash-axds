-- =============================================================================
-- Adiciona a plataforma PayT ao checkout
-- =============================================================================
-- A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
-- precisam andar juntos. Ver a entrada "payt" no registro para os detalhes
-- do payload (confirmed: false — estrutura vista num payload real, mas ainda
-- sem venda de teste rodada por esta instalação).
-- =============================================================================

alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn', 'payt'
    )
  );
