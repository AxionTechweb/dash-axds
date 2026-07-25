-- =====================================================================
-- VALIDAÇÃO PÓS-SETUP — rode DEPOIS do _setup_completo.sql.
-- Cole o resultado de volta no chat (não contém nenhum segredo).
-- =====================================================================

-- 1) Tabelas criadas + RLS habilitada em cada uma
select
  c.relname                                   as tabela,
  c.relrowsecurity                            as rls_ligada,
  (select count(*) from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = c.relname)           as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 2) Funções obrigatórias (esperado: 6 linhas, todas com existe = true)
select
  f.nome,
  (p.oid is not null) as existe,
  p.prosecdef         as security_definer
from (values
  ('app_encrypt'), ('app_decrypt'), ('identify_visitor'),
  ('log_event'), ('rate_limit_hit'), ('rate_limit_cleanup')
) as f(nome)
left join pg_proc p
  on p.proname = f.nome
 and p.pronamespace = 'public'::regnamespace
order by f.nome;

-- 3) Branding deve ter EXATAMENTE 1 linha
select count(*) as linhas_branding from public.branding;

-- 4) Extensão pgcrypto instalada
select extname, extversion from pg_extension where extname = 'pgcrypto';

-- 5) purchases publicada no Realtime (feed do Dashboard)
select tablename as publicada_no_realtime
from pg_publication_tables
where pubname = 'supabase_realtime';

-- (O teste de ida-e-volta da criptografia é feito fora daqui, pelo agente, para
--  não gravar a ENCRYPTION_KEY no histórico de queries do Supabase.)
