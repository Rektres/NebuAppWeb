-- ============================================================
-- Actualización 6 — Pestaña Juegos (temporizador + álbum de fotos)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente. Sugerencia: set lock_timeout = '5s'; si hay bloqueos.
-- ============================================================

create table if not exists juegos (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  tipo text,
  nombre text,
  fecha timestamptz not null,
  duracion_seg integer,
  observaciones text,
  fotos jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table juegos enable row level security;
drop policy if exists "solo padres" on juegos;
create policy "solo padres" on juegos for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
