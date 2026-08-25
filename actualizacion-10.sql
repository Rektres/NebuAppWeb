-- ============================================================
-- Actualización 10 — Limpieza de módulos descontinuados
-- (Pastillas, Controles Médicos, Supermercado y Compras)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Eliminar tablas y políticas en cascada
drop table if exists compra_items cascade;
drop table if exists compras cascade;
drop table if exists super cascade;
drop table if exists controles cascade;
drop table if exists pastillas_log cascade;
drop table if exists pastillas cascade;
