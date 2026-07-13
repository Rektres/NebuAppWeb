-- ============================================================
-- Rutinas del Bebé — Script de creación de tablas y políticas
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Tomas de leche
create table tomas (
  id bigint generated always as identity primary key,
  fecha_hora timestamptz not null,
  cantidad_ml integer not null,
  created_at timestamptz default now()
);

-- Vitaminas
create table vitaminas (
  id bigint generated always as identity primary key,
  fecha_hora timestamptz not null,
  gotas integer not null default 5,
  created_at timestamptz default now()
);

-- Cambios de pañal
create table panales (
  id bigint generated always as identity primary key,
  fecha_hora timestamptz not null,
  heces boolean not null default false,
  orina boolean not null default false,
  created_at timestamptz default now()
);

-- Sueño (siestas y noche)
create table sueno (
  id bigint generated always as identity primary key,
  inicio timestamptz not null,
  fin timestamptz not null,
  created_at timestamptz default now()
);

-- Configuración compartida (una sola fila): nombre del bebé, foto y paleta
create table config (
  id integer primary key default 1 check (id = 1),
  nombre_bebe text default 'Mi bebé',
  foto_base64 text,
  paleta text default 'celeste',
  updated_at timestamptz default now()
);
insert into config (id) values (1);

-- ============================================================
-- RLS: solo usuarios autenticados pueden leer/escribir.
-- Todos los usuarios autenticados comparten los mismos datos
-- (app familiar: mamá y papá ven lo mismo).
-- ============================================================
alter table tomas enable row level security;
alter table vitaminas enable row level security;
alter table panales enable row level security;
alter table sueno enable row level security;
alter table config enable row level security;

create policy "auth all" on tomas for all to authenticated using (true) with check (true);
create policy "auth all" on vitaminas for all to authenticated using (true) with check (true);
create policy "auth all" on panales for all to authenticated using (true) with check (true);
create policy "auth all" on sueno for all to authenticated using (true) with check (true);
create policy "auth all" on config for all to authenticated using (true) with check (true);
