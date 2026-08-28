-- Corrige overflow em retention_25/50/75 (mesmo bug já visto em
-- hook_rate/play_rate/pitch_retention, 20260810120000): um criativo com
-- poucas sessões pode chegar a EXATAMENTE 100% de retenção num ponto do
-- vídeo, e "numeric(6,4)" só suporta até 99.9999 (2 dígitos antes da
-- vírgula) — 100.0000 estoura e derruba o upsert inteiro em creative_reports.
-- numeric(7,4) dá margem até 999.9999, de sobra pra uma taxa 0–100.

alter table public.creative_reports
  alter column retention_25 type numeric(7,4),
  alter column retention_50 type numeric(7,4),
  alter column retention_75 type numeric(7,4);
