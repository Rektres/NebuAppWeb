-- ============================================================
-- Actualización 15: Solicitudes de Acceso desde Login y Tutorial Inicial Obligatorio
-- ============================================================

-- 1. Tabla para registrar solicitudes de acceso enviadas desde la pantalla de Login
create table if not exists solicitudes_acceso (
  id bigint generated always as identity primary key,
  nombre_bebe text not null,
  nombre_padre_1 text not null,
  nombre_padre_2 text not null,
  correo_padre_1 text not null,
  correo_padre_2 text not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now()
);

alter table solicitudes_acceso enable row level security;

-- RPC público (security definer) para registrar la solicitud de acceso desde el Login (anon)
create or replace function registrar_solicitud_acceso(
  p_nombre_bebe text,
  p_nombre_padre_1 text,
  p_nombre_padre_2 text,
  p_correo_padre_1 text,
  p_correo_padre_2 text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into solicitudes_acceso (
    nombre_bebe,
    nombre_padre_1,
    nombre_padre_2,
    correo_padre_1,
    correo_padre_2
  ) values (
    trim(p_nombre_bebe),
    trim(p_nombre_padre_1),
    trim(p_nombre_padre_2),
    lower(trim(p_correo_padre_1)),
    lower(trim(p_correo_padre_2))
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function registrar_solicitud_acceso(text, text, text, text, text) to anon, authenticated;

-- 2. Columna opcional en miembros para persistir la finalización del tutorial inicial obligatorio
alter table miembros add column if not exists tutorial_inicial_completado boolean not null default false;
