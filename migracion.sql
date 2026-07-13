-- ============================================================
-- MIGRACIÓN: del esquema anterior (tabla config, datos compartidos)
-- al nuevo esquema con bebés, padres vinculados y whitelist.
-- Ejecutar UNA SOLA VEZ en: SQL Editor → New query → Run.
-- Conserva todos los registros existentes: se asignan al bebé creado
-- desde la tabla config, y los usuarios actuales quedan vinculados
-- como 'madre' (cada uno puede corregir su rol en ⚙️ Configuración).
-- ============================================================

-- 1. Nuevas tablas
create table bebes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Mi bebé',
  foto_base64 text,
  paleta text default 'celeste',
  codigo text unique not null,
  created_at timestamptz default now()
);

create table miembros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bebe_id uuid not null references bebes(id) on delete cascade,
  rol text not null check (rol in ('madre', 'padre')),
  created_at timestamptz default now()
);

create table whitelist (email text primary key);
-- Agrega aquí los correos autorizados a registrarse en el futuro:
-- insert into whitelist (email) values ('correo@ejemplo.com');

-- 2. Columna bebe_id en las tablas de datos
alter table tomas add column bebe_id uuid references bebes(id) on delete cascade;
alter table vitaminas add column bebe_id uuid references bebes(id) on delete cascade;
alter table panales add column bebe_id uuid references bebes(id) on delete cascade;
alter table sueno add column bebe_id uuid references bebes(id) on delete cascade;

-- 3. Migrar: crear el bebé desde config, asignarle todos los datos
--    y vincular a todos los usuarios existentes
do $$
declare v_bebe uuid;
begin
  insert into bebes (nombre, foto_base64, paleta, codigo)
  select coalesce(nombre_bebe, 'Mi bebé'), foto_base64, coalesce(paleta, 'celeste'),
         upper(substr(md5(random()::text), 1, 6))
  from config where id = 1
  returning id into v_bebe;

  if v_bebe is null then
    insert into bebes (codigo) values (upper(substr(md5(random()::text), 1, 6)))
    returning id into v_bebe;
  end if;

  update tomas set bebe_id = v_bebe where bebe_id is null;
  update vitaminas set bebe_id = v_bebe where bebe_id is null;
  update panales set bebe_id = v_bebe where bebe_id is null;
  update sueno set bebe_id = v_bebe where bebe_id is null;

  insert into miembros (user_id, bebe_id, rol)
  select id, v_bebe, 'madre' from auth.users
  on conflict (user_id) do nothing;
end $$;

alter table tomas alter column bebe_id set not null;
alter table vitaminas alter column bebe_id set not null;
alter table panales alter column bebe_id set not null;
alter table sueno alter column bebe_id set not null;

-- 4. La tabla config ya no se usa
drop table config;

-- 5. Funciones (security definer)
create or replace function mis_bebes() returns setof uuid
language sql security definer stable set search_path = public as
$$ select bebe_id from miembros where user_id = auth.uid() $$;

create or replace function email_autorizado(correo text) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from whitelist where lower(email) = lower(correo)) $$;

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

-- 6. Whitelist: bloquea registros no autorizados (también "Add user" del Dashboard)
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

-- 7. RLS nuevo: reemplaza las políticas antiguas
drop policy "auth all" on tomas;
drop policy "auth all" on vitaminas;
drop policy "auth all" on panales;
drop policy "auth all" on sueno;

alter table bebes enable row level security;
alter table miembros enable row level security;
alter table whitelist enable row level security; -- sin políticas: nadie la lee directo

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
