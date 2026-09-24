-- ============================================================
-- Actualización 12 — Función segura para Informe Diario Automático (23:00 hrs)
-- Permite consultar el balance del día (leche, pañales, sueño y vitaminas)
-- y la comparativa con el día anterior para despacho programado a WhatsApp.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create or replace function obtener_informe_diario_bebe(p_codigo text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bebe bebes;
  v_res json;
begin
  if p_codigo is not null and trim(p_codigo) <> '' then
    select * into v_bebe from bebes where codigo = upper(trim(p_codigo)) limit 1;
  else
    select * into v_bebe from bebes order by created_at asc limit 1;
  end if;

  if v_bebe.id is null then
    return json_build_object('error', 'Bebé no encontrado');
  end if;

  -- Retornar bebé y los registros de tomas, pañales, sueño y vitaminas de los últimos días
  select json_build_object(
    'ok', true,
    'bebe', json_build_object(
      'id', v_bebe.id,
      'nombre', v_bebe.nombre,
      'codigo', v_bebe.codigo,
      'whatsapp_config', v_bebe.whatsapp_config
    ),
    'tomas', (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select id, fecha_hora, cantidad_ml
        from tomas
        where bebe_id = v_bebe.id
          and fecha_hora >= now() - interval '4 days'
        order by fecha_hora asc
      ) t
    ),
    'panales', (
      select coalesce(json_agg(p), '[]'::json)
      from (
        select id, fecha_hora, heces, orina
        from panales
        where bebe_id = v_bebe.id
          and fecha_hora >= now() - interval '4 days'
        order by fecha_hora asc
      ) p
    ),
    'sueno', (
      select coalesce(json_agg(s), '[]'::json)
      from (
        select id, inicio, fin
        from sueno
        where bebe_id = v_bebe.id
          and inicio >= now() - interval '4 days'
        order by inicio asc
      ) s
    ),
    'vitaminas', (
      select coalesce(json_agg(v), '[]'::json)
      from (
        select id, fecha_hora, gotas
        from vitaminas
        where bebe_id = v_bebe.id
          and fecha_hora >= now() - interval '4 days'
        order by fecha_hora asc
      ) v
    ),
    'vitaminas_tipos', (
      select coalesce(json_agg(vt), '[]'::json)
      from (
        select id, nombre, gotas_default
        from vitaminas_tipos
        where bebe_id = v_bebe.id
      ) vt
    ),
    'vitaminas_tipos_log', (
      select coalesce(json_agg(vtl), '[]'::json)
      from (
        select id, vitamina_id, fecha, hora, gotas
        from vitaminas_tipos_log
        where bebe_id = v_bebe.id
          and fecha >= (current_date - 3)
      ) vtl
    )
  ) into v_res;

  return v_res;
end;
$$;

-- Permitir ejecución anónima para el cron del servidor
grant execute on function obtener_informe_diario_bebe(text) to anon, authenticated;
