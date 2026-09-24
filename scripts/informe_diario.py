#!/usr/bin/env python3
"""
NebuApp — Script de Despacho Automático de Informe Diario (23:00 hrs)
Se ejecuta vía cron diario en rektressserver a las 23:00 hrs CLT (America/Santiago).
Calcula métricas del día (leche, pañales, sueño, vitaminas) y comparativa con el día anterior.
Envía el resumen exclusivamente al grupo de WhatsApp "Alertas Nebubu" (120363414573336812@g.us).
"""

import sys
import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Configuración del Gateway y Supabase
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://iseevvlfdjdsrxtxicvu.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable_vAGgN8aMen8mk6NRU1qSwQ_McgBI603')
EVOLUTION_API_URL = os.environ.get('EVOLUTION_API_URL', 'http://127.0.0.1:8080')
EVOLUTION_API_KEY = os.environ.get('EVOLUTION_API_KEY', 'NebuAppWspKey_2026_Secure!')
EVOLUTION_INSTANCE = os.environ.get('EVOLUTION_INSTANCE', 'nebuapp')
NEBU_GROUP_JID = '120363414573336812@g.us'
STATE_FILE = os.path.expanduser('~/whatsapp-gateway/ultimo_informe.json')
CHILE_TZ = ZoneInfo('America/Santiago')

def formatear_duracion(mins):
    h = int(mins // 60)
    m = int(round(mins % 60))
    if h > 0 and m > 0:
        return f"{h}h {m}min"
    if h > 0:
        return f"{h}h"
    return f"{m}min"

def calcular_tramos_sueno_dia(registro, dia_key):
    """Calcula cuántos minutos de un registro de sueño ocurrieron en dia_key."""
    inicio_str = registro.get('inicio')
    if not inicio_str:
        return 0
    try:
        # Convertir a datetime en zona horaria de Chile
        dt_ini = datetime.fromisoformat(inicio_str.replace('Z', '+00:00')).astimezone(CHILE_TZ)
        fin_str = registro.get('fin')
        if fin_str:
            dt_fin = datetime.fromisoformat(fin_str.replace('Z', '+00:00')).astimezone(CHILE_TZ)
        else:
            dt_fin = datetime.now(CHILE_TZ)

        if dt_fin <= dt_ini:
            return 0

        # Segmentar por día calendario
        mins_en_dia = 0
        cur = dt_ini
        while cur < dt_fin:
            cur_key = cur.strftime('%Y-%m-%d')
            # Siguiente medianoche
            next_midnight = (cur + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            fin_tramo = min(dt_fin, next_midnight)
            mins = (fin_tramo - cur).total_seconds() / 60.0
            if cur_key == dia_key and mins > 0:
                mins_en_dia += mins
            cur = fin_tramo
        return mins_en_dia
    except Exception as e:
        print(f"Error procesando tramo de sueño: {e}", file=sys.stderr)
        return 0

def obtener_datos_supabase():
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/obtener_informe_diario_bebe"
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': 'application/json'
    }
    req = urllib.request.Request(url, data=json.dumps({}).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            if res.status == 200:
                body = res.read().decode('utf-8')
                return json.loads(body)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        print(f"[Aviso] HTTP {e.code} llamando RPC Supabase: {err_msg}", file=sys.stderr)
    except Exception as e:
        print(f"[Error] Fallo al consultar Supabase: {e}", file=sys.stderr)
    return None

def generar_informe(data, ahora_cl):
    hoy_key = ahora_cl.strftime('%Y-%m-%d')
    ayer_cl = ahora_cl - timedelta(days=1)
    ayer_key = ayer_cl.strftime('%Y-%m-%d')

    bebe = data.get('bebe', {})
    bebe_nombre = bebe.get('nombre', 'Nebubu')

    # 1. Leche
    tomas = data.get('tomas', [])
    leche_hoy = 0
    leche_ayer = 0
    for t in tomas:
        fh = t.get('fecha_hora')
        if not fh:
            continue
        try:
            dt = datetime.fromisoformat(fh.replace('Z', '+00:00')).astimezone(CHILE_TZ)
            k = dt.strftime('%Y-%m-%d')
            ml = int(t.get('cantidad_ml', 0) or 0)
            if k == hoy_key:
                leche_hoy += ml
            elif k == ayer_key:
                leche_ayer += ml
        except Exception:
            continue
    diff_leche = leche_hoy - leche_ayer

    # 2. Pañales
    panales = data.get('panales', [])
    panales_hoy = 0
    orina_hoy = 0
    heces_hoy = 0
    panales_ayer = 0
    for p in panales:
        fh = p.get('fecha_hora')
        if not fh:
            continue
        try:
            dt = datetime.fromisoformat(fh.replace('Z', '+00:00')).astimezone(CHILE_TZ)
            k = dt.strftime('%Y-%m-%d')
            if k == hoy_key:
                panales_hoy += 1
                if p.get('orina'):
                    orina_hoy += 1
                if p.get('heces'):
                    heces_hoy += 1
            elif k == ayer_key:
                panales_ayer += 1
        except Exception:
            continue
    diff_panales = panales_hoy - panales_ayer

    # 3. Sueño
    suenos = data.get('sueno', [])
    mins_sueno_hoy = sum(calcular_tramos_sueno_dia(s, hoy_key) for s in suenos)
    mins_sueno_ayer = sum(calcular_tramos_sueno_dia(s, ayer_key) for s in suenos)
    diff_sueno = int(round(mins_sueno_hoy - mins_sueno_ayer))

    # 4. Vitaminas
    vits_simple = data.get('vitaminas', [])
    vits_log = data.get('vitaminas_tipos_log', [])
    vits_tipos = data.get('vitaminas_tipos', [])

    tiene_vit_simple_hoy = False
    gotas_simple = 0
    for v in vits_simple:
        fh = v.get('fecha_hora')
        if fh:
            try:
                dt = datetime.fromisoformat(fh.replace('Z', '+00:00')).astimezone(CHILE_TZ)
                if dt.strftime('%Y-%m-%d') == hoy_key:
                    tiene_vit_simple_hoy = True
                    gotas_simple = v.get('gotas', 5)
            except Exception:
                pass

    logs_hoy = [vl for vl in vits_log if vl.get('fecha') == hoy_key]
    tiene_vit_log_hoy = len(logs_hoy) > 0
    vitaminas_tomadas = tiene_vit_simple_hoy or tiene_vit_log_hoy

    detalle_vitaminas = ""
    if tiene_vit_log_hoy:
        nombres = []
        for l in logs_hoy:
            vid = l.get('vitamina_id')
            t_obj = next((vt for vt in vits_tipos if vt.get('id') == vid), None)
            nom = t_obj.get('nombre') if t_obj else 'Vitamina'
            nombres.append(nom)
        if nombres:
            detalle_vitaminas = f" ({', '.join(nombres)})"
    elif tiene_vit_simple_hoy and gotas_simple:
        detalle_vitaminas = f" ({gotas_simple} gotas)"

    vits_texto = f"Tomadas ✓{detalle_vitaminas}" if vitaminas_tomadas else "No administradas ⚠️"

    # Comparativas en lenguaje natural exacto
    if diff_leche > 0:
        comp_leche = f"🍼 Hoy tomó {diff_leche} ml más que ayer"
    elif diff_leche < 0:
        comp_leche = f"🍼 Hoy tomó {abs(diff_leche)} ml menos que ayer"
    else:
        comp_leche = f"🍼 Hoy tomó la misma cantidad de leche que ayer ({leche_hoy} ml)"

    if diff_sueno > 0:
        comp_sueno = f"😴 Hoy durmió {formatear_duracion(diff_sueno)} más que ayer"
    elif diff_sueno < 0:
        comp_sueno = f"😴 Hoy durmió {formatear_duracion(abs(diff_sueno))} menos que ayer"
    else:
        comp_sueno = f"😴 Hoy durmió la misma cantidad de tiempo que ayer ({formatear_duracion(mins_sueno_hoy)})"

    pal_panal_mas = "pañal más" if diff_panales == 1 else "pañales más"
    pal_panal_menos = "pañal menos" if abs(diff_panales) == 1 else "pañales menos"
    if diff_panales > 0:
        comp_panales = f"🧷 Hoy usó {diff_panales} {pal_panal_mas} que ayer"
    elif diff_panales < 0:
        comp_panales = f"🧷 Hoy usó {abs(diff_panales)} {pal_panal_menos} que ayer"
    else:
        comp_panales = f"🧷 Hoy usó la misma cantidad de pañales que ayer ({panales_hoy})"

    # Formateo de fecha en español
    meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    dias_semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    dia_nom = dias_semana[ahora_cl.weekday()]
    mes_nom = meses[ahora_cl.month - 1]
    fecha_legible = f"{dia_nom}, {ahora_cl.day} de {mes_nom} de {ahora_cl.year}"

    desglose_panal = ""
    partes = []
    if orina_hoy > 0:
        partes.append(f"{orina_hoy} pipí")
    if heces_hoy > 0:
        partes.append(f"{heces_hoy} caca")
    if partes:
        desglose_panal = f" ({', '.join(partes)})"

    pal_veces = "vez" if panales_hoy == 1 else "veces"

    mensaje = (
        f"📊 *Informe Diario NebuApp*\n"
        f"👶 *Bebé:* {bebe_nombre}\n"
        f"📅 *Fecha:* {fecha_legible} (23:00 hrs)\n\n"
        f"🍼 *Consumo de leche:* {leche_hoy} ml\n"
        f"🧷 *Cambios de pañal:* {panales_hoy} {pal_veces}{desglose_panal}\n"
        f"😴 *Horas de sueño:* {formatear_duracion(mins_sueno_hoy)}\n"
        f"💊 *Vitaminas:* {vits_texto}\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📈 *Comparativa con el día anterior:*\n"
        f"{comp_leche}\n"
        f"{comp_sueno}\n"
        f"{comp_panales}"
    )

    return {
        'hoy_key': hoy_key,
        'mensaje': mensaje,
        'datos': {
            'leche_hoy': leche_hoy,
            'panales_hoy': panales_hoy,
            'mins_sueno_hoy': mins_sueno_hoy,
            'vitaminas_tomadas': vitaminas_tomadas,
            'diff_leche': diff_leche,
            'diff_panales': diff_panales,
            'diff_sueno': diff_sueno
        }
    }

def enviar_whatsapp(texto, destinatario=NEBU_GROUP_JID):
    url = f"{EVOLUTION_API_URL.rstrip('/')}/message/sendText/{urllib.parse.quote(EVOLUTION_INSTANCE)}"
    headers = {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
    }
    payload = {
        'number': destinatario,
        'text': texto
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            res_body = res.read().decode('utf-8', errors='ignore')
            print(f"[OK] Notificación enviada con éxito a {destinatario}: HTTP {res.status}")
            return True
    except Exception as e:
        print(f"[Error] Fallo al enviar WhatsApp a {destinatario}: {e}", file=sys.stderr)
        return False

def main():
    force = '--force' in sys.argv
    dry_run = '--dry-run' in sys.argv

    ahora_cl = datetime.now(CHILE_TZ)
    hoy_key = ahora_cl.strftime('%Y-%m-%d')
    print(f"[{ahora_cl.isoformat()}] Evaluando informe diario para fecha {hoy_key} (Hora CLT: {ahora_cl.strftime('%H:%M')})...")

    # Verificar estado previo para evitar duplicados
    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except Exception:
            state = {}

    if not force and state.get('ultimo_informe') == hoy_key:
        print(f"[Info] El informe para {hoy_key} ya fue despachado previamente a las {state.get('enviado_en')}. Saliendo.")
        return

    data = obtener_datos_supabase()
    if not data or not data.get('ok'):
        print("[Aviso] No se pudieron obtener datos remotos desde Supabase (o función no ejecutada aún). El cliente web gestionará el despacho.")
        return

    informe = generar_informe(data, ahora_cl)
    mensaje = informe['mensaje']

    if dry_run:
        print("=== VISTA PREVIA DEL INFORME (DRY RUN) ===")
        print(mensaje)
        print("=========================================")
        return

    destinatario = NEBU_GROUP_JID
    bebe_cfg = data.get('bebe', {}).get('whatsapp_config', {})
    if isinstance(bebe_cfg, str):
        try:
            bebe_cfg = json.loads(bebe_cfg)
        except Exception:
            bebe_cfg = {}
    if isinstance(bebe_cfg, dict) and bebe_cfg.get('target'):
        t = bebe_cfg.get('target', '')
        if '@g.us' in t:
            destinatario = t.strip()

    ok = enviar_whatsapp(mensaje, destinatario)
    if ok:
        state['ultimo_informe'] = hoy_key
        state['enviado_en'] = ahora_cl.isoformat()
        try:
            os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2)
            print(f"[OK] Estado actualizado en {STATE_FILE}.")
        except Exception as e:
            print(f"[Aviso] No se pudo guardar archivo de estado: {e}", file=sys.stderr)

if __name__ == '__main__':
    main()
