-- ============================================================
-- Actualización 14: Controles de Niño Sano (MINSAL), Permisos de Módulos y Admin 5D5005
-- ============================================================

alter table bebes
  add column if not exists sexo text default 'nino' check (sexo in ('nina', 'nino')),
  add column if not exists perimetro_cefalico_cm numeric,
  add column if not exists es_admin boolean not null default false,
  add column if not exists wsp_desbloqueado boolean not null default false,
  add column if not exists modulos_desbloqueados jsonb default '["stats","leche","panales","comidas","sueno","info"]'::jsonb,
  add column if not exists modulos_visibles jsonb default '["stats","alertas","leche","comidas","vitaminas","panales","sueno","info","bitacora","juegos"]'::jsonb;

alter table vitaminas_tipos
  add column if not exists unidad text default 'gotas',
  add column if not exists hora_sugerida time;

-- Otorgar permisos completos de administrador al bebé 5D5005 (y sus padres vinculados)
update bebes
set
  es_admin = true,
  wsp_desbloqueado = true,
  modulos_desbloqueados = '["stats","alertas","leche","comidas","vitaminas","panales","sueno","info","bitacora","juegos"]'::jsonb,
  modulos_visibles = '["stats","alertas","leche","comidas","vitaminas","panales","sueno","info","bitacora","juegos"]'::jsonb
where upper(codigo) = '5D5005';
