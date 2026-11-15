-- ============================================================
-- Actualización 13 — Escala de Bristol Pediátrica en Pañales y Módulo de Comidas
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente.
-- ============================================================

-- 1. Escala de Bristol (tipos 1 al 7) en pañales (opcional/nulo para registros anteriores)
alter table panales add column if not exists bristol integer check (bristol between 1 and 7);

-- 2. Tabla de comidas / platos diarios (opcional / respaldo estructural)
-- Nota: La aplicación sincroniza los platos, alergias y mapa de Bristol
-- mediante la tabla bitacora para operar sin requerir migración bloqueante,
-- pero esta definición provee soporte nativo adicional si se ejecuta.
create table if not exists comidas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha date not null,
  hora time,
  tiempo_comida text default 'Almuerzo',
  semana_num integer default 1,
  ingredientes jsonb not null default '{}'::jsonb,
  alimento_nuevo text,
  alimento_nuevo_grupo text,
  reacciones jsonb default '[]'::jsonb,
  sintomas text,
  notas text,
  created_at timestamptz default now()
);

alter table comidas enable row level security;
drop policy if exists "solo padres" on comidas;
create policy "solo padres" on comidas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
