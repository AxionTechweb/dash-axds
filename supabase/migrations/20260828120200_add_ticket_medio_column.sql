-- Coluna esquecida na primeira leva (20260828120000): "Ticket Médio" tinha
-- header na planilha mas nenhum campo correspondente no writer, e por causa
-- disso o alias curto "ic" (initiate_checkout) batia como substring dentro
-- de "ticketmedio" e a coluna mostrava o valor de IC por engano.

alter table public.creative_reports
  add column if not exists ticket_medio numeric(14,2);
