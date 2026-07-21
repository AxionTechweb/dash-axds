-- =============================================================================
-- Fase 1 · Extensões e funções utilitárias
-- =============================================================================
-- pgcrypto: usado para cifrar/decifrar segredos de integração com uma chave
-- (ENCRYPTION_KEY) que vive SOMENTE no ambiente do servidor — nunca no banco.
-- A cifra/decifra acontece via funções abaixo, chamadas apenas pelo service_role
-- (servidor), passando a chave por parâmetro (corpo da requisição, sob TLS).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Trigger genérico para manter updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cifra/decifra de segredos (pgcrypto, chave simétrica passada pelo servidor).
-- O ciphertext é armazenado como TEXT base64 (colunas *_token / hottok), então
-- o servidor só troca strings com o banco (sem bytea via JSON).
--   - app_encrypt(plaintext, key) -> text base64
--   - app_decrypt(ciphertext_base64, key) -> text (somente no servidor)
-- STRICT: entrada NULL retorna NULL (token não configurado permanece NULL).
-- EXECUTE liberado apenas para service_role: decifra só acontece no servidor.
-- ---------------------------------------------------------------------------
create or replace function public.app_encrypt(plaintext text, key text)
returns text
language sql
strict
volatile
as $$
  select encode(extensions.pgp_sym_encrypt(plaintext, key), 'base64');
$$;

create or replace function public.app_decrypt(ciphertext text, key text)
returns text
language sql
strict
volatile
as $$
  select extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), key);
$$;

revoke all on function public.app_encrypt(text, text) from public;
revoke all on function public.app_decrypt(text, text) from public;
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;
