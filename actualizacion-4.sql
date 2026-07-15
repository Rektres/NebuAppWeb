-- ============================================================
-- Actualización 4 — Info del bebé + datos de contacto de los padres
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente.
-- ============================================================

-- Info ampliada del bebé
alter table bebes add column if not exists nombre_completo text;
alter table bebes add column if not exists apodo text;
alter table bebes add column if not exists grupo_sanguineo text;
alter table bebes add column if not exists alergias text;
alter table bebes add column if not exists rutinas text;

-- Datos de contacto de cada padre/madre
alter table miembros add column if not exists nombre_completo text;
alter table miembros add column if not exists telefono text;
alter table miembros add column if not exists correo_contacto text;
