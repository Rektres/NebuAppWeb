-- ============================================================
-- Actualización 8 — Lista del Súper (lista maestra + compras con foto de boleta)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Aditivo e idempotente. Sugerencia: set lock_timeout = '5s'; si hay bloqueos.
-- ============================================================

-- Lista maestra de productos
create table if not exists super (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  nombre text not null,
  categoria text,
  created_at timestamptz default now()
);

-- Compras: una "Compra Finalizada" = un viaje/boleta, con foto y monto
create table if not exists compras (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  fecha_hora timestamptz not null,
  foto_boleta text,
  monto_total numeric,
  notas text,
  created_at timestamptz default now()
);

-- Productos dentro de una compra
create table if not exists compra_items (
  id bigint generated always as identity primary key,
  bebe_id uuid not null references bebes(id) on delete cascade,
  compra_id bigint not null references compras(id) on delete cascade,
  producto_id bigint not null references super(id) on delete cascade,
  cantidad integer not null default 1
);

alter table super enable row level security;
alter table compras enable row level security;
alter table compra_items enable row level security;

drop policy if exists "solo padres" on super;
create policy "solo padres" on super for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));

drop policy if exists "solo padres" on compras;
create policy "solo padres" on compras for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));

drop policy if exists "solo padres" on compra_items;
create policy "solo padres" on compra_items for all to authenticated
  using (bebe_id in (select mis_bebes())) with check (bebe_id in (select mis_bebes()));
