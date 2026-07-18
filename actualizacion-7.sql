-- ============================================================
-- Actualización 7 — Fecha/hora en el registro de pastillas
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente.
-- ============================================================

-- Hora en que se tomó la pastilla (la fecha ya existía en pastillas_log)
alter table pastillas_log add column if not exists hora time;
