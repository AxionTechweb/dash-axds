-- =============================================================================
-- Corrige overflow em hook_rate/play_rate/pitch_retention
-- =============================================================================
-- Descoberto no primeiro cron real da semana: alguns criativos com poucas
-- sessões (1-5) tiveram play_rate ou over_pitch_rate EXATAMENTE 100% —
-- "numeric(6,4)" só suporta até 99.9999 (2 dígitos antes da vírgula), então
-- 100.0000 estourava e derrubava o upsert inteiro em creative_reports
-- (rowsWritten=0 silenciosamente, sem chegar a escrever no Sheets).
-- numeric(7,4) dá margem até 999.9999 — de sobra pra uma taxa que já é
-- limitada a 0–100 pela própria Vturb, só corrigindo o estouro no limite.
-- =============================================================================

alter table public.creative_reports
  alter column hook_rate       type numeric(7,4),
  alter column play_rate       type numeric(7,4),
  alter column pitch_retention type numeric(7,4);
