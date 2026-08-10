-- =============================================================================
-- Moeda da conta de anúncio da Meta
-- =============================================================================
-- Descoberto ao conectar uma conta em dólar ("USD 2"): os relatórios (semanal
-- e checkpoint diário) usam o `spend`/`revenue` cru que a Meta devolve, na
-- moeda DA CONTA — sem conversão (decisão do usuário: não converter câmbio).
-- Sem saber a moeda, esses números ficavam rotulados "(R$)" mesmo quando são
-- dólar. `currency` já vem em `discoverAdAccounts`/`testAdAccountConnection`
-- (Graph API) — só faltava persistir.
-- =============================================================================

alter table public.meta_ad_accounts
  add column if not exists currency text;
