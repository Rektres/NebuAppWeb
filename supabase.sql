-- ============================================================
-- Rutinas del Bebé — Esquema completo (instalación desde cero)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Si tu base ya tiene datos del esquema anterior, usa migracion.sql
-- ============================================================

-- ---------- Bebés: cada bebé tiene un código único para vincular a sus padres ----------
create table bebes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Mi bebé',
  foto_base64 text,
  paleta text default 'celeste',
  codigo text unique not null,
  fecha_nacimiento date,
  peso_kg numeric,
  talla_cm numeric,
  nombre_completo text,
  apodo text,
  grupo_sanguineo text,
  alergias text,
  rutinas text,
  lata_gramos numeric default 800,     -- tamaño de la lata de fórmula
  lata_abierta_en timestamptz,          -- cuándo se abrió la lata actual
  latas_usadas integer default 0,       -- contador de latas abiertas
  created_at timestamptz default now()
);

-- ---------- Miembros: qué usuario (madre/padre) pertenece a qué bebé ----------
create table miembros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bebe_id uuid not null references bebes(id) on delete cascade,
  rol text not null check (rol in ('madre', 'padre')),
  nombre_completo text,
  telefono text,
  correo_contacto text,
  grupo_sanguineo text,
  created_at timestamptz default now()
);

-- ---------- Whitelist: solo estos correos pueden registrarse ----------
create table whitelist (email text primary key);
-- Agrega aquí los correos autorizados:
-- insert into whitelist (email) values ('mama@ejemplo.com'), ('papa@ejemplo.com');

-- ---------- Tablas de datos (con bebe_id) ----------
create table tomas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha_hora timestamptz not null,
  cantidad_ml integer not null,
  created_at timestamptz default now()
);

create table vitaminas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha_hora timestamptz not null,
  gotas integer not null default 5,
  created_at timestamptz default now()
);

create table panales (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha_hora timestamptz not null,
  heces boolean not null default false,
  orina boolean not null default false,
  created_at timestamptz default now()
);

create table sueno (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  inicio timestamptz not null,
  fin timestamptz, -- null = siesta en curso (se cierra con "Despertó")
  created_at timestamptz default now()
);

-- Pastillas: lista maestra de medicamentos del bebé
create table pastillas (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  nombre text not null,
  horario text, -- 'am' | 'pm'
  created_at timestamptz default now()
);

-- Registro diario: una fila = esa pastilla fue tomada ese día
create table pastillas_log (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  pastilla_id bigint not null references pastillas(id) on delete cascade,
  fecha date not null,
  unique (pastilla_id, fecha)
);

-- Bitácora: hitos / anotaciones libres
create table bitacora (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  titulo text not null,
  fecha date not null,
  notas text,
  created_at timestamptz default now()
);

-- Controles médicos (control de niño sano)
create table controles (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  control text,                 -- cuál control (díada … 12 meses)
  profesional text,
  fecha date not null,
  edad text,
  peso_kg numeric,
  talla_cm numeric,
  perimetro_craneal numeric,
  diagnostico_nutricional text,
  diagnostico text,
  indicaciones text,
  alimentacion text,            -- códigos separados por coma: LME,LMP,FP,FE
  created_at timestamptz default now()
);

-- ============================================================
-- Funciones (security definer: se ejecutan con permisos del dueño)
-- ============================================================

-- Bebés a los que pertenece el usuario actual (evita recursión en las políticas)
create or replace function mis_bebes() returns setof uuid
language sql security definer stable set search_path = public as
$$ select bebe_id from miembros where user_id = auth.uid() $$;

-- ¿Está el correo autorizado a registrarse? (para mostrar error amable en la app)
create or replace function email_autorizado(correo text) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from whitelist where lower(email) = lower(correo)) $$;

-- Crear un bebé nuevo y vincularme como madre/padre. Devuelve el bebé (con su código).
create or replace function crear_bebe(p_nombre text, p_rol text) returns json
language plpgsql security definer set search_path = public as $$
declare v_bebe bebes;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    raise exception 'Ya estás vinculado a un bebé';
  end if;
  if p_rol not in ('madre', 'padre') then raise exception 'Rol inválido'; end if;
  insert into bebes (nombre, codigo)
  values (coalesce(nullif(trim(p_nombre), ''), 'Mi bebé'), upper(substr(md5(random()::text), 1, 6)))
  returning * into v_bebe;
  insert into miembros (user_id, bebe_id, rol) values (auth.uid(), v_bebe.id, p_rol);
  return row_to_json(v_bebe);
end $$;

-- Unirme a un bebé existente usando su código único. Devuelve el bebé.
create or replace function unirse_bebe(p_codigo text, p_rol text) returns json
language plpgsql security definer set search_path = public as $$
declare v_bebe bebes;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    raise exception 'Ya estás vinculado a un bebé';
  end if;
  if p_rol not in ('madre', 'padre') then raise exception 'Rol inválido'; end if;
  select * into v_bebe from bebes where codigo = upper(trim(p_codigo));
  if not found then raise exception 'Código no válido'; end if;
  if (select count(*) from miembros where bebe_id = v_bebe.id) >= 2 then
    raise exception 'Este bebé ya tiene a sus dos padres vinculados';
  end if;
  insert into miembros (user_id, bebe_id, rol) values (auth.uid(), v_bebe.id, p_rol);
  return row_to_json(v_bebe);
end $$;

-- Trigger: bloquea el registro de correos que no estén en la whitelist
-- (aplica también al "Add user" del Dashboard: agrega el correo a whitelist primero)
create or replace function validar_whitelist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.whitelist where lower(email) = lower(new.email)) then
    raise exception 'correo no autorizado';
  end if;
  return new;
end $$;

create trigger trg_whitelist before insert on auth.users
  for each row execute function validar_whitelist();

-- ============================================================
-- RLS: solo los padres vinculados a un bebé ven y escriben sus datos
-- ============================================================
alter table bebes enable row level security;
alter table miembros enable row level security;
alter table whitelist enable row level security; -- sin políticas: nadie la lee directo
alter table tomas enable row level security;
alter table vitaminas enable row level security;
alter table panales enable row level security;
alter table sueno enable row level security;
alter table pastillas enable row level security;
alter table pastillas_log enable row level security;
alter table bitacora enable row level security;
alter table controles enable row level security;

create policy "padres ven su bebe" on bebes for select to authenticated
  using (id in (select mis_bebes()));
create policy "padres editan su bebe" on bebes for update to authenticated
  using (id in (select mis_bebes())) with check (id in (select mis_bebes()));

create policy "ver miembros de mi bebe" on miembros for select to authenticated
  using (user_id = auth.uid() or bebe_id in (select mis_bebes()));
create policy "editar mi rol" on miembros for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo padres" on tomas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on vitaminas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on panales for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on sueno for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on pastillas for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on pastillas_log for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on bitacora for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
create policy "solo padres" on controles for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
