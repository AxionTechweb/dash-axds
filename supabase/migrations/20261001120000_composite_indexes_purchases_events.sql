-- Índices compostos pra acelerar as queries reais de dashboard/vturb/umbler,
-- que hoje filtram por area_id + status + intervalo de created_at (ou
-- area_id + event_name + created_at) ao mesmo tempo — só existiam índices de
-- uma coluna cada, forçando um bitmap-AND (ou scan maior) em vez de um único
-- index scan.
--
-- Sem `concurrently`: o SQL Editor do Supabase roda o script dentro de uma
-- transação, e `CREATE INDEX CONCURRENTLY` não pode rodar dentro de uma
-- transação (erro 25001). Como as tabelas não são grandes o bastante pra
-- doer, um `CREATE INDEX` normal (lock breve de escrita durante a criação)
-- é aceitável aqui.
create index if not exists purchases_area_created_idx
  on public.purchases (area_id, created_at);

create index if not exists purchases_area_status_created_idx
  on public.purchases (area_id, status, created_at);

create index if not exists events_log_area_event_created_idx
  on public.events_log (area_id, event_name, created_at);
