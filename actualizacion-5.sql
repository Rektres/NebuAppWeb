-- ============================================================
-- Actualización 5 — Grupo sanguíneo de los padres + Bitácora + Controles médicos
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente.
-- ============================================================

-- Tipo de sangre de cada padre/madre
alter table miembros add column if not exists grupo_sanguineo text;

-- ---------- Bitácora: hitos / anotaciones ----------
create table if not exists bitacora (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  titulo text not null,
  fecha date not null,
  notas text,
  created_at timestamptz default now()
);
alter table bitacora enable row level security;
drop policy if exists "solo padres" on bitacora;
create policy "solo padres" on bitacora for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));

-- ---------- Controles médicos ----------
create table if not exists controles (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  control text,
  profesional text,
  fecha date not null,
  edad text,
  peso_kg numeric,
  talla_cm numeric,
  perimetro_craneal numeric,
  diagnostico_nutricional text,
  diagnostico text,
  indicaciones text,
  alimentacion text,
  created_at timestamptz default now()
);
alter table controles enable row level security;
drop policy if exists "solo padres" on controles;
create policy "solo padres" on controles for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
