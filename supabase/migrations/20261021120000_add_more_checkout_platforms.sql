-- =============================================================================
-- Adiciona 16 novas plataformas de checkout
-- =============================================================================
-- A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
-- precisam andar juntos. Todas entram com confirmed: false (estrutura vista
-- em doc oficial e/ou numa implementação de referência já em produção, mas
-- ainda sem venda de teste rodada por ESTA instalação). Ver os caveats de
-- cada entrada do registro para o que falta confirmar.
-- =============================================================================

alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn', 'payt', 'hubla',
      'guru', 'eduzz', 'monetizze', 'mundpay', 'cartpanda', 'ggcheckout', 'lastlink',
      'wiven', 'frendz', 'herospark', 'kavoo', 'pagtrust', 'assiny', 'yampi', 'wiapy', 'doppus'
    )
  );
