-- ============================================================
-- Actualización 3 — Tabla de pastillas (nombre, horario am/pm, tomada)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente: sirve tanto para instalar la tabla nueva
-- como para migrar una versión anterior (que tenía columna 'cantidad').
-- ============================================================

create table if not exists pastillas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha_hora timestamptz not null, -- para agrupar por día
  nombre text,
  horario text, -- 'am' | 'pm'
  tomada boolean not null default false,
  created_at timestamptz default now()
);

-- Si ya la habías creado con la versión anterior:
alter table pastillas add column if not exists nombre text;
alter table pastillas add column if not exists horario text;
alter table pastillas add column if not exists tomada boolean not null default false;
alter table pastillas drop column if exists cantidad;

alter table pastillas enable row level security;
drop policy if exists "solo padres" on pastillas;
create policy "solo padres" on pastillas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
