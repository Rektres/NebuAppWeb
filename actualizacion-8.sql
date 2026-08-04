-- ============================================================
-- Actualización 8 — Vitaminas por nombre (checklist diario)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente. No toca la tabla "vitaminas" existente
-- (el registro rápido de dosis suelta sigue funcionando igual).
-- ============================================================

-- Lista maestra de vitaminas del bebé (por nombre)
create table if not exists vitaminas_tipos (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  nombre text not null,
  gotas_default integer,
  created_at timestamptz default now()
);
alter table vitaminas_tipos enable row level security;
drop policy if exists "solo padres" on vitaminas_tipos;
create policy "solo padres" on vitaminas_tipos for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));

-- Registro diario: una fila = esa vitamina fue dada ese día
create table if not exists vitaminas_tipos_log (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  vitamina_id bigint not null references vitaminas_tipos(id) on delete cascade,
  fecha date not null,
  hora time,
  gotas integer,
  unique (vitamina_id, fecha)
);
alter table vitaminas_tipos_log enable row level security;
drop policy if exists "solo padres" on vitaminas_tipos_log;
create policy "solo padres" on vitaminas_tipos_log for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
