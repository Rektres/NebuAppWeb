-- ============================================================
-- Actualización 3 — Fórmula (control de latas) + Pastillas (lista + registro diario)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente: se puede correr aunque ya exista parte del esquema.
-- ============================================================

-- ---------- Fórmula: control de latas en la ficha del bebé ----------
alter table bebes add column if not exists lata_gramos numeric default 800;
alter table bebes add column if not exists lata_abierta_en timestamptz;
alter table bebes add column if not exists latas_usadas integer default 0;

-- ---------- Pastillas: lista maestra de medicamentos ----------
create table if not exists pastillas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  nombre text,
  horario text, -- 'am' | 'pm'
  created_at timestamptz default now()
);
-- Ajusta versiones anteriores (que guardaban tomas por fila) a lista maestra:
alter table pastillas add column if not exists nombre text;
alter table pastillas add column if not exists horario text;
alter table pastillas drop column if exists tomada;
alter table pastillas drop column if exists fecha_hora;
alter table pastillas drop column if exists cantidad;

alter table pastillas enable row level security;
drop policy if exists "solo padres" on pastillas;
create policy "solo padres" on pastillas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));

-- ---------- Pastillas: registro diario (una fila = tomada ese día) ----------
create table if not exists pastillas_log (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  pastilla_id bigint not null references pastillas(id) on delete cascade,
  fecha date not null,
  unique (pastilla_id, fecha)
);

alter table pastillas_log enable row level security;
drop policy if exists "solo padres" on pastillas_log;
create policy "solo padres" on pastillas_log for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
