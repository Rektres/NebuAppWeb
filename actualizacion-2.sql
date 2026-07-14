-- ============================================================
-- ACTUALIZACIÓN 2: siestas en vivo + datos del bebé en el header
-- Ejecutar UNA SOLA VEZ en: SQL Editor → New query → Run
-- (sobre una base que ya tiene el esquema de bebés/miembros)
-- ============================================================

-- Siestas abiertas: el fin queda vacío hasta que se pulsa "Despertó"
alter table sueno alter column fin drop not null;

-- Datos del bebé mostrados en el header
alter table bebes add column fecha_nacimiento date;
alter table bebes add column peso_kg numeric;
alter table bebes add column talla_cm numeric;
