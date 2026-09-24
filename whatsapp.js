/* ============================================================
   NebuAppWeb — Módulo de Integración WhatsApp Gateway
   Servicio: Evolution API v2 (Baileys) en VPS rektressserver
   Envío de notificaciones colaborativas en tiempo real (No bloqueante)
   ============================================================ */

const NEBU_GROUP_JID = '120363414573336812@g.us';

const DEFAULT_WSP_CONFIG = {
  enabled: true,
  apiUrl: 'https://rektressserver.tailda85b3.ts.net:8443',
  apiKey: 'NebuAppWspKey_2026_Secure!',
  instance: 'nebuapp',
  target: NEBU_GROUP_JID,
  notifyTomas: true,
  notifyPanales: true,
  notifyVitaminas: true,
  notifySueno: true,
  notifyAlertaHambre: true,
  notifyAlertaVitaminas: true,
  notifyAlertaFecas: true,
  notifyAlertaSueno: true,
  notifyAlertaPanal: true,
  notifyInformeDiario: true,
};

/**
 * Obtiene la configuración actual de WhatsApp combinando localStorage y datos sincronizados del bebé.
 * La configuración compartida en Supabase (bebe.whatsapp_config) tiene máxima prioridad para que
 * cualquier ajuste realizado por mamá o papá sea compartido inmediatamente entre ambos.
 */
function getWhatsAppConfig(bebe = null) {
  let localCfg = {};
  try {
    const raw = localStorage.getItem('nebu_wsp_config');
    if (raw) localCfg = JSON.parse(raw);
  } catch (e) {
    console.warn('Error leyendo configuración local de WhatsApp:', e);
  }

  // Purga obligatoria de números personales en almacenamiento local:
  // Solo se admiten destinatarios de grupo de WhatsApp (@g.us)
  if (localCfg.target) {
    const limpios = typeof normalizarDestinatarios === 'function'
      ? normalizarDestinatarios(localCfg.target).filter((t) => t.endsWith('@g.us'))
      : [NEBU_GROUP_JID];
    localCfg.target = limpios.length > 0 ? limpios.join(', ') : NEBU_GROUP_JID;
    try {
      localStorage.setItem('nebu_wsp_config', JSON.stringify({ ...localCfg }));
    } catch {}
  }

  let bebeCfg = {};
  if (bebe && bebe.whatsapp_config) {
    try {
      bebeCfg = typeof bebe.whatsapp_config === 'string'
        ? JSON.parse(bebe.whatsapp_config)
        : bebe.whatsapp_config;
    } catch (e) {
      console.warn('Error leyendo configuración remota de WhatsApp del bebé:', e);
    }
  }

  const hasBebeCfg = bebeCfg && typeof bebeCfg === 'object' && Object.keys(bebeCfg).length > 0;
  // Si existe en Supabase, prevalece para ambos padres; sino usa almacenamiento local y defaults
  const merged = hasBebeCfg
    ? { ...DEFAULT_WSP_CONFIG, ...localCfg, ...bebeCfg }
    : { ...DEFAULT_WSP_CONFIG, ...localCfg };

  // Asegurar que siempre sea única y exclusivamente el grupo de WhatsApp
  const parsed = typeof normalizarDestinatarios === 'function' ? normalizarDestinatarios(merged.target) : [NEBU_GROUP_JID];
  const onlyGroups = parsed.filter((t) => t.endsWith('@g.us'));
  merged.target = onlyGroups.length > 0 ? onlyGroups.join(', ') : NEBU_GROUP_JID;

  return merged;
}

/**
 * Guarda la configuración de WhatsApp tanto localmente como en Supabase si está disponible.
 */
async function saveWhatsAppConfig(cfg, bebeId = null, dbClient = null) {
  try {
    localStorage.setItem('nebu_wsp_config', JSON.stringify(cfg));
  } catch (e) {
    console.warn('Error guardando en localStorage:', e);
  }

  if (bebeId && dbClient) {
    try {
      await dbClient
        .from('bebes')
        .update({ whatsapp_config: cfg })
        .eq('id', bebeId);
    } catch (e) {
      // Si la columna aún no existe en Supabase, no interrumpe la ejecución
      console.info('Aviso: Columna whatsapp_config no encontrada en tabla bebes de Supabase (guardado solo local).');
    }
  }
}

/**
 * Limpia y normaliza un número de teléfono individual.
 * Si tiene 9 dígitos y empieza en 9 (formato celular chileno), antepone el prefijo país 56.
 */
function limpiarNumeroTelefono(num) {
  let d = String(num).replace(/[^\d]/g, '');
  if (d.length === 9 && d.startsWith('9')) {
    d = '56' + d;
  }
  return d;
}

/**
 * Normaliza y extrae de forma ultra-robusta múltiples destinatarios.
 * Maneja números separados por coma, punto y coma, salto de línea, espacios, guiones, barras,
 * prefijos internacionales (+), números de 9 dígitos chilenos y números concatenados accidentalmente.
 * Retorna un arreglo de destinatarios únicos válidos (números y grupos).
 */
function normalizarDestinatarios(raw) {
  if (!raw) return [NEBU_GROUP_JID];
  if (Array.isArray(raw)) raw = raw.join('\n');

  let text = String(raw).trim();
  if (!text) return [NEBU_GROUP_JID];

  // 1. Detectar enlaces de invitación de WhatsApp en cualquier parte del texto
  const inviteRegex = /https?:\/\/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi;
  let inviteMatch;
  while ((inviteMatch = inviteRegex.exec(text)) !== null) {
    const code = inviteMatch[1];
    if (code === 'LWYU1T9wGW72wEwlcfSPDy') {
      text = text.replace(inviteMatch[0], NEBU_GROUP_JID);
    }
  }

  // 2. Detectar nombres de grupo como "Alertas Nebubu", "Alertas Nebu", "👥 Alertas Nebubu"
  text = text.replace(/(?:👥\s*)?Alertas\s+Nebu(?:bu)?/gi, NEBU_GROUP_JID);

  // 3. Separar por comas, punto y coma, saltos de línea o pipes (NO separar por barra '/' para no romper URLs)
  const tokens = text.split(/[\n\r,;|]+/);
  const result = [];

  for (let token of tokens) {
    token = token.trim();
    if (!token) continue;

    // A. JID de grupo (@g.us) o de usuario (@s.whatsapp.net)
    if (token.includes('@g.us') || token.includes('@s.whatsapp.net')) {
      const match = token.match(/([a-zA-Z0-9.\-_]+@(g\.us|s\.whatsapp\.net))/);
      if (match) {
        if (!result.includes(match[1])) result.push(match[1]);
        continue;
      }
    }

    // B. Números de 18 dígitos de grupo de WhatsApp ingresados sin '@g.us' (ej: 120363414573336812)
    const groupNumMatch = token.match(/\b(120363\d{12})\b/);
    if (groupNumMatch) {
      const jid = `${groupNumMatch[1]}@g.us`;
      if (!result.includes(jid)) result.push(jid);
      continue;
    }

    // C. Si contiene múltiples '+' (ej: +56944830378 +56950192577)
    if (token.includes('+')) {
      const subTokens = token.split(/(?=\+)/).filter(Boolean);
      for (const st of subTokens) {
        const cleaned = st.replace(/[^\d]/g, '');
        if (cleaned.length >= 8 && cleaned.length <= 15) {
          const num = limpiarNumeroTelefono(cleaned);
          if (!result.includes(num)) result.push(num);
        }
      }
      continue;
    }

    // D. Detectar patrones de celulares chilenos (569XXXXXXXX o 9XXXXXXXX)
    const matchesChilean = token.match(/(?:56)?9\d{8}/g);
    if (matchesChilean && matchesChilean.length > 0) {
      for (const m of matchesChilean) {
        const num = limpiarNumeroTelefono(m);
        if (!result.includes(num)) result.push(num);
      }
      continue;
    }

    // E. Caso numérico genérico (8 a 15 dígitos según norma internacional E.164)
    const digitsOnly = token.replace(/[^\d]/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      const num = limpiarNumeroTelefono(digitsOnly);
      if (!result.includes(num)) result.push(num);
    }
  }

  // Si tras la evaluación no queda ningún destinatario válido, usar por defecto el grupo Alertas Nebubu
  if (result.length === 0) {
    result.push(NEBU_GROUP_JID);
  }

  return Array.from(new Set(result.filter(Boolean)));
}

/**
 * Helper retrocompatible para obtener el primer destinatario válido.
 */
function normalizarDestinatario(target) {
  const list = normalizarDestinatarios(target);
  return list.length > 0 ? list[0] : '';
}

/**
 * Obtiene la lista de grupos de WhatsApp disponibles en la cuenta conectada.
 */
async function getWhatsAppGroups(config = null) {
  const cfg = config || getWhatsAppConfig();
  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/group/fetchAllGroups/${encodeURIComponent(cfg.instance)}?getParticipants=false`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(tId);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}`, groups: [] };
    }
    const data = await res.json();
    const groups = Array.isArray(data) ? data.map(g => ({
      id: g.id,
      subject: g.subject || 'Sin nombre',
      pictureUrl: g.pictureUrl || null,
      size: g.size || 0,
    })) : [];

    return { ok: true, groups };
  } catch (err) {
    clearTimeout(tId);
    return { ok: false, error: err.message, groups: [] };
  }
}

/**
 * Consulta el estado de conexión de la instancia en Evolution API.
 */
async function getWhatsAppConnectionState(config = null) {
  const cfg = config || getWhatsAppConfig();
  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/instance/connectionState/${encodeURIComponent(cfg.instance)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(tId);

    if (!res.ok) {
      return { state: 'error', message: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return {
      state: data?.instance?.state || 'close',
      raw: data,
    };
  } catch (err) {
    clearTimeout(tId);
    return { state: 'error', message: err.message };
  }
}

/**
 * Obtiene el código QR en Base64 y código de emparejamiento para vincular el WhatsApp.
 */
async function getWhatsAppQR(config = null) {
  const cfg = config || getWhatsAppConfig();
  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/instance/connect/${encodeURIComponent(cfg.instance)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(tId);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      ok: true,
      base64: data?.base64 || null,
      pairingCode: data?.pairingCode || null,
      code: data?.code || null,
      count: data?.count || 0,
    };
  } catch (err) {
    clearTimeout(tId);
    return { ok: false, error: err.message };
  }
}

/**
 * Helper para formatear fechas y horas en español chileno.
 */
function fmtFechaHora(isoStr) {
  try {
    const d = isoStr ? new Date(isoStr) : new Date();
    const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    const fecha = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    return { hora, fecha };
  } catch {
    return { hora: '--:--', fecha: '' };
  }
}

/**
 * Helper para formatear minutos en formato humano (Xh Ym).
 */
function fmtMinutos(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

/**
 * Calcula tramos de sueño por día calendario (respetando medianoche).
 */
function tramosSuenoPorDia(r) {
  if (!r.inicio) return [];
  const ini = new Date(r.inicio);
  const fin = r.fin ? new Date(r.fin) : new Date();
  if (fin <= ini) return [];
  const tramos = [];
  let cur = new Date(ini);
  const pad = (n) => String(n).padStart(2, '0');
  const dKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  while (cur < fin) {
    const dStr = dKey(cur);
    const midNext = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0);
    const finTramo = fin < midNext ? fin : midNext;
    const mins = (finTramo - cur) / 60000;
    if (mins > 0) {
      tramos.push({ key: dStr, mins });
    }
    cur = finTramo;
  }
  return tramos;
}

/**
 * Genera el balance del día y la comparativa exacta con el día anterior para el informe de las 23:00 hrs.
 */
function generarDatosInformeDiario(cache = {}, fechaRef = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const dKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const refDate = (fechaRef instanceof Date) ? fechaRef : new Date(fechaRef);
  const hoyKey = dKey(refDate);
  const ayerDate = new Date(refDate.getTime() - 86400000);
  const ayerKey = dKey(ayerDate);

  // 1. Leche (ml)
  const tomas = Array.isArray(cache.tomas) ? cache.tomas : [];
  let lecheHoy = 0;
  let lecheAyer = 0;
  tomas.forEach((t) => {
    if (!t.fecha_hora) return;
    const k = dKey(new Date(t.fecha_hora));
    const ml = Number(t.cantidad_ml) || 0;
    if (k === hoyKey) lecheHoy += ml;
    else if (k === ayerKey) lecheAyer += ml;
  });
  const diffLeche = lecheHoy - lecheAyer;

  // 2. Pañales (veces)
  const panales = Array.isArray(cache.panales) ? cache.panales : [];
  let panalesHoy = 0;
  let orinaHoy = 0;
  let hecesHoy = 0;
  let panalesAyer = 0;
  panales.forEach((p) => {
    if (!p.fecha_hora) return;
    const k = dKey(new Date(p.fecha_hora));
    if (k === hoyKey) {
      panalesHoy++;
      if (p.orina) orinaHoy++;
      if (p.heces) hecesHoy++;
    } else if (k === ayerKey) {
      panalesAyer++;
    }
  });
  const diffPanales = panalesHoy - panalesAyer;

  // 3. Sueño (minutos y horas)
  const suenos = Array.isArray(cache.sueno) ? cache.sueno : [];
  let minsSuenoHoy = 0;
  let minsSuenoAyer = 0;
  suenos.forEach((s) => {
    tramosSuenoPorDia(s).forEach((t) => {
      if (t.key === hoyKey) minsSuenoHoy += t.mins;
      else if (t.key === ayerKey) minsSuenoAyer += t.mins;
    });
  });
  minsSuenoHoy = Math.round(minsSuenoHoy);
  minsSuenoAyer = Math.round(minsSuenoAyer);
  const diffSueno = minsSuenoHoy - minsSuenoAyer;

  // 4. Vitaminas
  const vitsSimple = Array.isArray(cache.vitaminas) ? cache.vitaminas : [];
  const vitsLog = Array.isArray(cache.vitaminas_tipos_log) ? cache.vitaminas_tipos_log : [];
  const tieneVitSimpleHoy = vitsSimple.some((r) => r.fecha_hora && dKey(new Date(r.fecha_hora)) === hoyKey);
  const tieneVitLogHoy = vitsLog.some((r) => r.fecha === hoyKey);
  const vitaminasTomadas = tieneVitSimpleHoy || tieneVitLogHoy;

  let detalleVitaminas = '';
  if (tieneVitLogHoy) {
    const tipos = Array.isArray(cache.vitaminas_tipos) ? cache.vitaminas_tipos : [];
    const logsHoy = vitsLog.filter((r) => r.fecha === hoyKey);
    const nombres = logsHoy.map((l) => {
      const tipo = tipos.find((t) => t.id === l.vitamina_id);
      return tipo?.nombre || 'Vitamina';
    });
    if (nombres.length > 0) detalleVitaminas = ` (${nombres.join(', ')})`;
  } else if (tieneVitSimpleHoy) {
    const vHoy = vitsSimple.find((r) => r.fecha_hora && dKey(new Date(r.fecha_hora)) === hoyKey);
    if (vHoy?.gotas) detalleVitaminas = ` (${vHoy.gotas} gotas)`;
  }

  // Comparativas exactas en lenguaje natural
  let compLeche = '';
  if (diffLeche > 0) {
    compLeche = `🍼 Hoy tomó ${diffLeche} ml más que ayer`;
  } else if (diffLeche < 0) {
    compLeche = `🍼 Hoy tomó ${Math.abs(diffLeche)} ml menos que ayer`;
  } else {
    compLeche = `🍼 Hoy tomó la misma cantidad de leche que ayer (${lecheHoy} ml)`;
  }

  let compSueno = '';
  if (diffSueno > 0) {
    compSueno = `😴 Hoy durmió ${fmtMinutos(diffSueno)} más que ayer`;
  } else if (diffSueno < 0) {
    compSueno = `😴 Hoy durmió ${fmtMinutos(Math.abs(diffSueno))} menos que ayer`;
  } else {
    compSueno = `😴 Hoy durmió la misma cantidad de tiempo que ayer (${fmtMinutos(minsSuenoHoy)})`;
  }

  let compPanales = '';
  const palPanalMas = diffPanales === 1 ? 'pañal más' : 'pañales más';
  const palPanalMenos = Math.abs(diffPanales) === 1 ? 'pañal menos' : 'pañales menos';
  if (diffPanales > 0) {
    compPanales = `🧷 Hoy usó ${diffPanales} ${palPanalMas} que ayer`;
  } else if (diffPanales < 0) {
    compPanales = `🧷 Hoy usó ${Math.abs(diffPanales)} ${palPanalMenos} que ayer`;
  } else {
    compPanales = `🧷 Hoy usó la misma cantidad de pañales que ayer (${panalesHoy})`;
  }

  const opcionesFecha = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  let fechaLegible = refDate.toLocaleDateString('es-CL', opcionesFecha);
  fechaLegible = fechaLegible.charAt(0).toUpperCase() + fechaLegible.slice(1);

  return {
    hoyKey,
    ayerKey,
    fechaLegible,
    lecheHoy,
    lecheAyer,
    diffLeche,
    panalesHoy,
    orinaHoy,
    hecesHoy,
    panalesAyer,
    diffPanales,
    minsSuenoHoy,
    minsSuenoAyer,
    diffSueno,
    vitaminasTomadas,
    detalleVitaminas,
    compLeche,
    compSueno,
    compPanales,
  };
}

/**
 * Construye el mensaje completo del informe diario para WhatsApp.
 */
function construirMensajeInformeDiario(datos, contexto = {}) {
  const bebeNombre = contexto.bebe?.nombre || 'Bebé';
  const vitsTexto = datos.vitaminasTomadas
    ? `Tomadas ✓${datos.detalleVitaminas}`
    : 'No administradas ⚠️';

  let desglosePanal = '';
  if (datos.panalesHoy > 0) {
    const partes = [];
    if (datos.orinaHoy > 0) partes.push(`${datos.orinaHoy} pipí`);
    if (datos.hecesHoy > 0) partes.push(`${datos.hecesHoy} caca`);
    if (partes.length > 0) desglosePanal = ` (${partes.join(', ')})`;
  }

  const palVeces = datos.panalesHoy === 1 ? 'vez' : 'veces';

  return `📊 *Informe Diario NebuApp*\n` +
         `👶 *Bebé:* ${bebeNombre}\n` +
         `📅 *Fecha:* ${datos.fechaLegible} (23:00 hrs)\n\n` +
         `🍼 *Consumo de leche:* ${datos.lecheHoy} ml\n` +
         `🧷 *Cambios de pañal:* ${datos.panalesHoy} ${palVeces}${desglosePanal}\n` +
         `😴 *Horas de sueño:* ${fmtMinutos(datos.minsSuenoHoy)}\n` +
         `💊 *Vitaminas:* ${vitsTexto}\n\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `📈 *Comparativa con el día anterior:*\n` +
         `${datos.compLeche}\n` +
         `${datos.compSueno}\n` +
         `${datos.compPanales}`;
}

/**
 * Despacho manual inmediato del informe diario al grupo de WhatsApp.
 */
function enviarInformeDiarioManual(cache, contexto = {}) {
  const now = new Date();
  const datos = generarDatosInformeDiario(cache, now);
  enviarNotificacionWhatsApp('informe_diario', datos, contexto);
  return { ok: true, datos };
}

/**
 * Construye el texto enriquecido para el mensaje de WhatsApp.
 */
function construirMensajeWhatsApp(tipo, datos, contexto = {}) {
  const bebeNombre = contexto.bebe?.nombre || 'Bebé';
  const rol = contexto.miRol === 'madre' ? '👩 Mamá' : (contexto.miRol === 'padre' ? '👨 Papá' : 'Familia');

  switch (tipo) {
    case 'tomas': {
      const { hora, fecha } = fmtFechaHora(datos.fecha_hora);
      return `🍼 *Nueva Toma de Leche*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `🥛 *Cantidad:* ${datos.cantidad_ml} ml\n` +
             `⏰ *Hora:* ${hora} (${fecha})\n` +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'panales': {
      const { hora, fecha } = fmtFechaHora(datos.fecha_hora);
      let estado = 'Limpio';
      if (datos.orina && datos.heces) estado = 'Pipí y Caca 💧💩';
      else if (datos.orina) estado = 'Pipí 💧';
      else if (datos.heces) estado = 'Caca 💩';

      return `🧷 *Cambio de Pañal*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `✨ *Estado:* ${estado}\n` +
             `⏰ *Hora:* ${hora} (${fecha})\n` +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'vitaminas': {
      const { hora, fecha } = fmtFechaHora(datos.fecha_hora);
      return `💊 *Vitaminas Administradas*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `💧 *Dosis:* ${datos.gotas || 5} gotas\n` +
             `⏰ *Hora:* ${hora} (${fecha})\n` +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'vitaminas_tipos': {
      const hora = datos.hora || fmtFechaHora(new Date().toISOString()).hora;
      return `💊 *Vitamina Suministrada*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `🧪 *Nombre:* ${datos.nombre || 'Vitamina'}\n` +
             `💧 *Dosis:* ${datos.gotas || 5} gotas\n` +
             `⏰ *Hora:* ${hora}\n` +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'sueno_inicio': {
      const { hora, fecha } = fmtFechaHora(datos.inicio);
      return `😴 *El bebé se ha dormido*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `⏰ *Hora de inicio:* ${hora} (${fecha})\n` +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'sueno_fin': {
      const { hora: hIni } = fmtFechaHora(datos.inicio);
      const { hora: hFin, fecha } = fmtFechaHora(datos.fin);
      let durTxt = '';
      if (datos.inicio && datos.fin) {
        const mins = Math.max(0, Math.round((new Date(datos.fin) - new Date(datos.inicio)) / 60000));
        durTxt = fmtMinutos(mins);
      }
      return `☀️ *¡El bebé ha despertado!*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `⏰ *Horario:* ${hIni} ➔ ${hFin} (${fecha})\n` +
             (durTxt ? `💤 *Duración del descanso:* ${durTxt}\n` : '') +
             `👤 *Registrado por:* ${rol}`;
    }

    case 'sueno': {
      if (!datos.fin) {
        return construirMensajeWhatsApp('sueno_inicio', datos, contexto);
      }
      return construirMensajeWhatsApp('sueno_fin', datos, contexto);
    }

    case 'alerta_hambre': {
      const { hora } = fmtFechaHora(datos.ultimaFecha);
      const tiempoTxt = fmtMinutos(datos.minutosTranscurridos || (datos.durmiendo ? 480 : 150));
      const reitHeader = datos.reiteracion && datos.reiteracion > 1 ? ` (Recordatorio #${datos.reiteracion})` : '';
      const reitNota = datos.reiteracion && datos.reiteracion > 1
        ? `\n⏰ *Recordatorio:* Han pasado más de 15 minutos desde el aviso anterior y aún no se registra la toma de leche.`
        : '';

      if (datos.durmiendo) {
        return `⚠️ *Alerta de Rutina: Hora de Comer (Bebé Durmiendo)*${reitHeader}\n` +
               `👶 *Bebé:* ${bebeNombre}\n` +
               `🍼 *Última toma:* hace ${tiempoTxt}${hora ? ` (a las ${hora})` : ''}\n` +
               `💤 *Estado:* El bebé está durmiendo.\n` +
               `📢 *Aviso:* Han transcurrido más de 8 horas desde su última toma de leche. Evalúa si es necesario despertarlo suavemente para alimentarlo.${reitNota}`;
      }

      return `⚠️ *Alerta de Rutina: Hora de Comer*${reitHeader}\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `🍼 *Última toma:* hace ${tiempoTxt}${hora ? ` (a las ${hora})` : ''}\n` +
             `📢 *Aviso:* Han transcurrido más de 2:30 horas desde su última toma de leche.${reitNota}`;
    }

    case 'alerta_vitaminas': {
      const reitHeader = datos.reiteracion && datos.reiteracion > 1 ? ` (Recordatorio #${datos.reiteracion})` : '';
      const reitNota = datos.reiteracion && datos.reiteracion > 1
        ? `\n⏰ *Recordatorio:* Han pasado más de 15 minutos desde el aviso anterior y aún no se marcan sus vitaminas.`
        : '';
      return `⚠️ *Alerta de Rutina: Vitaminas Pendientes*${reitHeader}\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `💊 *Estado:* Aún no se han administrado sus vitaminas de hoy.\n` +
             `⏰ *Hora actual:* ${datos.horaActual || 'Pasadas las 19:00 hrs'}\n` +
             `📢 *Recordatorio:* Recuerda suministrar y marcar sus vitaminas diarias.${reitNota}`;
    }

    case 'alerta_fecas': {
      const { fecha } = fmtFechaHora(datos.ultimaFecha);
      const dias = datos.diasTranscurridos || 3;
      return `🚨 *Alerta Pediátrica: Pañal sin Deposición*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `💩 *Última deposición:* hace ${dias} días (${fecha})\n` +
             `📢 *Atención:* Han transcurrido más de 3 días sin registrar deposición. Considera evaluar masajes en su pancita o consultar con su pediatra.`;
    }

    case 'alerta_sueno': {
      const { hora } = fmtFechaHora(datos.despertarFecha);
      const tiempoTxt = fmtMinutos(datos.minutosDespierto || 100);
      return `⚠️ *Alerta de Rutina: Ventana de Sueño Superada*\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `☀️ *Despierto desde:* hace ${tiempoTxt} (despertó a las ${hora})\n` +
             `📢 *Aviso:* Lleva más de 1:40 horas despierto. Es probable que esté sobrecansado y necesite iniciar su siesta.`;
    }

    case 'alerta_panal': {
      const { hora } = fmtFechaHora(datos.ultimaFecha);
      const tiempoTxt = fmtMinutos(datos.minutosTranscurridos || 240);
      const reitHeader = datos.reiteracion && datos.reiteracion > 1 ? ` (Recordatorio #${datos.reiteracion})` : '';
      const reitNota = datos.reiteracion && datos.reiteracion > 1
        ? `\n⏰ *Recordatorio:* Han pasado más de 15 minutos desde el aviso previo y sigue sin registrarse el cambio de pañal.`
        : '';
      return `🧷 *Alerta de Rutina: Cambio de Pañal Necesario*${reitHeader}\n` +
             `👶 *Bebé:* ${bebeNombre}\n` +
             `⏰ *Último cambio:* hace ${tiempoTxt}${hora ? ` (a las ${hora})` : ''}\n` +
             `📢 *Aviso:* Han transcurrido más de 4 horas sin registrar cambio de pañal. Revisa si necesita un cambio para proteger su piel y prevenir irritaciones.${reitNota}`;
    }

    case 'informe_diario': {
      return construirMensajeInformeDiario(datos, contexto);
    }

    case 'prueba': {
      return `✅ *NebuAppWeb*: Prueba de conexión exitosa con WhatsApp.\n` +
             `🚀 Gateway activo en *rektressserver* vía Evolution API v2.\n` +
             `⏰ ${new Date().toLocaleString('es-CL')}`;
    }

    default:
      return null;
  }
}

/**
 * Envío asíncrono y desacoplado (Fire-and-forget) a la API de WhatsApp.
 * Soporta múltiples destinatarios (números personales y grupos de WhatsApp en simultáneo).
 * Nunca bloquea ni lanza excepciones hacia la interfaz de usuario.
 */
function enviarNotificacionWhatsApp(tipo, datos, contexto = {}) {
  const cfg = getWhatsAppConfig(contexto.bebe);
  if (!cfg.enabled) return;

  let targets = normalizarDestinatarios(cfg.target);
  if (targets.length === 0) return;

  // Filtrado de eventos según preferencias
  if (tipo === 'tomas' && !cfg.notifyTomas) return;
  if (tipo === 'panales' && !cfg.notifyPanales) return;
  if ((tipo === 'vitaminas' || tipo === 'vitaminas_tipos') && !cfg.notifyVitaminas) return;
  if ((tipo === 'sueno' || tipo === 'sueno_inicio' || tipo === 'sueno_fin') && !cfg.notifySueno) return;
  if (tipo === 'alerta_hambre' && !cfg.notifyAlertaHambre) return;
  if (tipo === 'alerta_vitaminas' && !cfg.notifyAlertaVitaminas) return;
  if (tipo === 'alerta_fecas' && !cfg.notifyAlertaFecas) return;
  if (tipo === 'alerta_sueno' && !cfg.notifyAlertaSueno) return;
  if (tipo === 'alerta_panal' && !cfg.notifyAlertaPanal) return;
  if (tipo === 'informe_diario' && cfg.notifyInformeDiario === false) return;

  // Requisito estricto: Las alertas y notificaciones se envían exclusivamente al grupo de WhatsApp y a nadie más
  targets = targets.filter((t) => t.endsWith('@g.us'));
  if (targets.length === 0) {
    targets = [NEBU_GROUP_JID];
  }

  const mensaje = construirMensajeWhatsApp(tipo, datos, contexto);
  if (!mensaje) return;

  const endpoint = `${cfg.apiUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(cfg.instance)}`;

  // Enviar a todos los destinatarios en paralelo
  targets.forEach((target) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apiKey,
      },
      body: JSON.stringify({
        number: target,
        text: mensaje,
      }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[WhatsApp Gateway] Error al enviar a ${target} (${res.status}):`, res.statusText);
        } else {
          console.log(`[WhatsApp Gateway] Notificación '${tipo}' enviada con éxito a ${target}.`);
        }
      })
      .catch((err) => {
        console.warn(`[WhatsApp Gateway] Fallo no bloqueante al enviar a ${target}:`, err.message);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  });
}

/**
 * Función interactiva para enviar un mensaje de prueba a uno o varios destinatarios.
 */
async function probarConexionWhatsApp(targetCustom = null, configCustom = null) {
  const cfg = { ...getWhatsAppConfig(), ...(configCustom || {}) };
  const targets = normalizarDestinatarios(targetCustom || cfg.target);

  if (targets.length === 0) {
    return { ok: false, message: 'Ingresa al menos un número telefónico o ID de grupo de WhatsApp.' };
  }

  const endpoint = `${cfg.apiUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(cfg.instance)}`;
  const textoPrueba = construirMensajeWhatsApp('prueba', {}, {});

  const promises = targets.map(async (target) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.apiKey,
        },
        body: JSON.stringify({
          number: target,
          text: textoPrueba,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.response?.message || json?.message || `HTTP ${res.status}`;
        return { target, ok: false, error: Array.isArray(errMsg) ? errMsg.join(', ') : errMsg };
      }
      return { target, ok: true };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      const msg = isAbort ? 'Tiempo de espera agotado (timeout)' : err.message;
      return { target, ok: false, error: msg };
    }
  });

  const results = await Promise.all(promises);
  const exitosos = results.filter(r => r.ok).length;
  const fallidos = results.filter(r => !r.ok);

  if (exitosos === targets.length) {
    const plural = targets.length === 1 ? 'destinatario' : `${targets.length} destinatarios`;
    return { ok: true, message: `¡Mensaje de prueba enviado con éxito a ${plural}! ✓`, results };
  } else if (exitosos > 0) {
    return {
      ok: true,
      message: `Enviado a ${exitosos}/${targets.length} destinatarios. (Fallaron: ${fallidos.map(f => f.target).join(', ')})`,
      results,
    };
  } else {
    return {
      ok: false,
      message: `Fallaron los envíos (${fallidos.map(f => `${f.target}: ${f.error}`).join('; ')})`,
      results,
    };
  }
}

/**
 * Intervalo de reiteración de alertas no resueltas:
 * - Comida (hambre), pañal y vitaminas: se reiteran cada 15 minutos (900.000 ms) hasta que se registre la gestión.
 * - Sueño y deposición (fecas): NO se reiteran cada 15 minutos (aviso único por vigilia/día).
 */
const ALERT_RETRY_INTERVAL_MS = 15 * 60 * 1000;

const ALERT_COOLDOWNS = {
  alerta_hambre: ALERT_RETRY_INTERVAL_MS,
  alerta_vitaminas: ALERT_RETRY_INTERVAL_MS,
  alerta_panal: ALERT_RETRY_INTERVAL_MS,
  alerta_sueno: 120 * 60 * 1000,
  alerta_fecas: 24 * 60 * 60 * 1000,
};

/**
 * Evalúa las 5 reglas proactivas de rutina pediátrica a partir del estado actual de datos en caché:
 * 1. Toma de leche:
 *    - Si el bebé está durmiendo: alertar si no ha comido por más de 8 horas (>480 min).
 *    - Si está despierto: alertar si no ha comido por más de 2:30 horas (>150 min).
 * 2. Vitaminas diarias: pasadas las 19:00 hrs sin vitaminas registradas hoy.
 * 3. Fecas: más de 3 días (72 hrs) sin registrar deposiciones.
 * 4. Sueño: más de 1:40 horas despierto (>100 min).
 * 5. Cambio de pañal: más de 4 horas sin cambio de pañal (>240 min).
 */
function evaluarAlertasRutina(cache = {}) {
  const now = new Date();
  const res = {
    hambre: { activa: false, durmiendo: false, minsTranscurridos: 0, ultimaFecha: null, mensaje: 'Al día' },
    vitaminas: { activa: false, tomadaHoy: false, horaActual: '', mensaje: 'Al día' },
    fecas: { activa: false, diasTranscurridos: 0, ultimaFecha: null, mensaje: 'Normal' },
    sueno: { activa: false, durmiendo: false, minsDespierto: 0, despertarFecha: null, mensaje: 'Normal' },
    panal: { activa: false, minsTranscurridos: 0, ultimaFecha: null, mensaje: 'Normal' },
    conteoActivas: 0,
  };

  // Detección previa de estado de sueño (activo vs despierto)
  const suenos = Array.isArray(cache.sueno) ? cache.sueno : [];
  const siestaActiva = suenos.find((s) => !s.fin);
  const estaDurmiendo = Boolean(siestaActiva);
  res.sueno.durmiendo = estaDurmiendo;
  res.hambre.durmiendo = estaDurmiendo;

  // 1. Alimentación (Durmiendo: > 8 hrs = 480 min / Despierto: > 2:30 hrs = 150 min)
  const tomas = Array.isArray(cache.tomas) ? cache.tomas : [];
  if (tomas.length > 0) {
    const tomasOrdenadas = [...tomas].sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
    const ultimaToma = tomasOrdenadas[0];
    const diffMs = now - new Date(ultimaToma.fecha_hora);
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    res.hambre.minsTranscurridos = mins;
    res.hambre.ultimaFecha = ultimaToma.fecha_hora;

    if (estaDurmiendo) {
      // Caso 1: Bebé durmiendo -> alertar solo si lleva más de 8 horas sin comer (>480 min)
      if (mins >= 480) {
        res.hambre.activa = true;
        res.hambre.mensaje = `Durmiendo: lleva ${fmtMinutos(mins)} sin comer (> 8 hrs)`;
      } else {
        res.hambre.activa = false;
        res.hambre.mensaje = `Durmiendo 💤 (${fmtMinutos(mins)} sin comer, máx 8 hrs)`;
      }
    } else {
      // Caso 2: Bebé despierto -> alertar si lleva más de 2:30 horas sin comer (>150 min)
      if (mins >= 150) {
        res.hambre.activa = true;
        res.hambre.mensaje = `Lleva ${fmtMinutos(mins)} sin comer (> 2:30 hrs)`;
      } else {
        res.hambre.activa = false;
        res.hambre.mensaje = `Última toma hace ${fmtMinutos(mins)}`;
      }
    }
  } else {
    res.hambre.mensaje = 'Sin tomas registradas';
  }

  // 2. Vitaminas (pasadas las 19:00 hrs sin registrar hoy)
  const pad2 = (n) => String(n).padStart(2, '0');
  const toLocalDayKey = (d) => {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  };
  const todayKey = toLocalDayKey(now);
  const horaActual = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  res.vitaminas.horaActual = horaActual;

  const vitsSimple = Array.isArray(cache.vitaminas) ? cache.vitaminas : [];
  const vitsLog = Array.isArray(cache.vitaminas_tipos_log) ? cache.vitaminas_tipos_log : [];
  // Revisar si se registró en la tabla simple de vitaminas hoy (respetando zona horaria local del dispositivo)
  const tieneVitSimpleHoy = vitsSimple.some((r) => r.fecha_hora && toLocalDayKey(r.fecha_hora) === todayKey);
  // Revisar si existe registro en la tabla de checklist de vitaminas de hoy (cualquier fila para hoy indica que fue tomada)
  const tieneVitLogHoy = vitsLog.some((r) => r.fecha === todayKey);
  const tomadaHoy = tieneVitSimpleHoy || tieneVitLogHoy;
  res.vitaminas.tomadaHoy = tomadaHoy;

  if (tomadaHoy) {
    res.vitaminas.activa = false;
    res.vitaminas.mensaje = 'Vitaminas administradas hoy ✓';
  } else {
    if (now.getHours() >= 19) {
      res.vitaminas.activa = true;
      res.vitaminas.mensaje = `Pendiente pasada las 19:00 hrs (${horaActual})`;
    } else {
      res.vitaminas.activa = false;
      res.vitaminas.mensaje = 'Pendiente para hoy (antes de las 19:00)';
    }
  }

  // 3. Fecas (más de 3 días sin deposiciones)
  const panales = Array.isArray(cache.panales) ? cache.panales : [];
  const panalesConHeces = panales.filter((p) => p.heces).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
  if (panalesConHeces.length > 0) {
    const ultimoHeces = panalesConHeces[0];
    const diffMs = now - new Date(ultimoHeces.fecha_hora);
    const dias = Math.floor(diffMs / (24 * 3600 * 1000));
    const horas = Math.floor(diffMs / 3600000);
    res.fecas.diasTranscurridos = dias;
    res.fecas.ultimaFecha = ultimoHeces.fecha_hora;
    if (dias >= 3) {
      res.fecas.activa = true;
      res.fecas.mensaje = `Lleva ${dias} días sin deposición (> 3 días)`;
    } else {
      res.fecas.mensaje = `Última deposición hace ${dias > 0 ? `${dias}d ` : ''}${horas % 24}h`;
    }
  } else if (panales.length > 0) {
    res.fecas.mensaje = 'Sin registros de fecas';
  }

  // 4. Sueño (más de 1:40 horas despierto = 100 min)
  if (siestaActiva) {
    res.sueno.durmiendo = true;
    res.sueno.activa = false;
    res.sueno.mensaje = 'Durmiendo actualmente 💤';
  } else {
    const suenosCompletos = suenos.filter((s) => s.fin).sort((a, b) => new Date(b.fin) - new Date(a.fin));
    if (suenosCompletos.length > 0) {
      const ultimoSueno = suenosCompletos[0];
      const diffMs = now - new Date(ultimoSueno.fin);
      const minsDespierto = Math.max(0, Math.floor(diffMs / 60000));
      res.sueno.minsDespierto = minsDespierto;
      res.sueno.despertarFecha = ultimoSueno.fin;
      if (minsDespierto >= 100) {
        res.sueno.activa = true;
        res.sueno.mensaje = `Lleva ${fmtMinutos(minsDespierto)} despierto (> 1:40 hrs)`;
      } else {
        res.sueno.mensaje = `Despierto hace ${fmtMinutos(minsDespierto)}`;
      }
    } else {
      res.sueno.mensaje = 'Sin registro de siestas recientes';
    }
  }

  // 5. Cambio de pañal (más de 4 horas sin cambio = 240 min)
  if (panales.length > 0) {
    const panalesOrdenados = [...panales].sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
    const ultimoPanal = panalesOrdenados[0];
    const diffMs = now - new Date(ultimoPanal.fecha_hora);
    const minsPanal = Math.max(0, Math.floor(diffMs / 60000));
    res.panal.minsTranscurridos = minsPanal;
    res.panal.ultimaFecha = ultimoPanal.fecha_hora;
    if (minsPanal >= 240) {
      res.panal.activa = true;
      res.panal.mensaje = `Lleva ${fmtMinutos(minsPanal)} sin cambio de pañal (> 4 hrs)`;
    } else {
      res.panal.mensaje = `Último cambio hace ${fmtMinutos(minsPanal)}`;
    }
  } else {
    res.panal.mensaje = 'Sin cambios de pañal registrados';
  }

  res.conteoActivas = (res.hambre.activa ? 1 : 0) +
                      (res.vitaminas.activa ? 1 : 0) +
                      (res.fecas.activa ? 1 : 0) +
                      (res.sueno.activa ? 1 : 0) +
                      (res.panal.activa ? 1 : 0);

  return res;
}

/**
 * Supervisa las alertas y despacha a WhatsApp respetando el cooldown anti-spam.
 */
function verificarYDespacharAlertasWhatsApp(cache = {}, contexto = {}) {
  const alertas = evaluarAlertasRutina(cache);
  let rawLast = {};
  try {
    rawLast = JSON.parse(localStorage.getItem('nebu_alert_timestamps') || '{}');
  } catch {}

  const now = Date.now();
  let enviadas = 0;

  // Configuración de las 5 reglas proactivas
  const reglas = [
    {
      key: 'alerta_hambre',
      activa: alertas.hambre.activa,
      reiterar: true,
      datos: () => ({
        minutosTranscurridos: alertas.hambre.minsTranscurridos,
        ultimaFecha: alertas.hambre.ultimaFecha,
        durmiendo: alertas.hambre.durmiendo,
      }),
    },
    {
      key: 'alerta_vitaminas',
      activa: alertas.vitaminas.activa,
      reiterar: true,
      datos: () => ({
        horaActual: alertas.vitaminas.horaActual,
      }),
    },
    {
      key: 'alerta_panal',
      activa: alertas.panal.activa,
      reiterar: true,
      datos: () => ({
        minutosTranscurridos: alertas.panal.minsTranscurridos,
        ultimaFecha: alertas.panal.ultimaFecha,
      }),
    },
    {
      key: 'alerta_sueno',
      activa: alertas.sueno.activa,
      reiterar: false, // Sin reiteración de 15 minutos
      datos: () => ({
        minutosDespierto: alertas.sueno.minsDespierto,
        despertarFecha: alertas.sueno.despertarFecha,
      }),
    },
    {
      key: 'alerta_fecas',
      activa: alertas.fecas.activa,
      reiterar: false, // Sin reiteración de 15 minutos
      datos: () => ({
        diasTranscurridos: alertas.fecas.diasTranscurridos,
        ultimaFecha: alertas.fecas.ultimaFecha,
      }),
    },
  ];

  reglas.forEach(({ key, activa, reiterar, datos }) => {
    if (activa) {
      const ultimo = rawLast[key] || 0;
      const count = rawLast[`${key}_count`] || 0;
      const cooldown = ALERT_COOLDOWNS[key] || ALERT_RETRY_INTERVAL_MS;

      if (reiterar) {
        // Alertas con reiteración cada 15 min mientras siga sin gestionarse (comida, vitaminas, pañal)
        if (!ultimo || (now - ultimo >= cooldown)) {
          const nuevaReiteracion = count + 1;
          enviarNotificacionWhatsApp(key, {
            ...datos(),
            reiteracion: nuevaReiteracion,
          }, contexto);
          rawLast[key] = now;
          rawLast[`${key}_count`] = nuevaReiteracion;
          enviadas++;
        }
      } else {
        // Alertas SIN reiteración cada 15 min (sueño y deposición): se envía un único aviso al activarse
        if (!ultimo || (now - ultimo >= cooldown)) {
          enviarNotificacionWhatsApp(key, {
            ...datos(),
            reiteracion: 1,
          }, contexto);
          rawLast[key] = now;
          rawLast[`${key}_count`] = 1;
          enviadas++;
        }
      }
    } else {
      // Cuando la alerta ya no está activa (se registró toma, pañal, vitamina, siesta),
      // se reinicia el contador y marca temporal para que la próxima alerta inicie desde cero inmediatamente
      if (rawLast[key] || rawLast[`${key}_count`]) {
        delete rawLast[key];
        delete rawLast[`${key}_count`];
        enviadas++;
      }
    }
  });

  // 6. Despacho automático del Informe Diario a las 23:00 hrs
  const nowDate = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const hoyDayKey = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(nowDate.getDate())}`;
  const cfg = getWhatsAppConfig(contexto.bebe);

  if (nowDate.getHours() >= 23 && cfg.notifyInformeDiario !== false) {
    const yaEnviadoLocal = rawLast.informe_diario === hoyDayKey;
    const yaEnviadoRemoto = cfg.ultimoInformeFecha === hoyDayKey;

    if (!yaEnviadoLocal && !yaEnviadoRemoto) {
      const datosInforme = generarDatosInformeDiario(cache, nowDate);
      enviarNotificacionWhatsApp('informe_diario', datosInforme, contexto);
      rawLast.informe_diario = hoyDayKey;
      enviadas++;

      // Guardar fecha en config compartida para evitar reenvío duplicado desde el otro padre
      cfg.ultimoInformeFecha = hoyDayKey;
      if (contexto.bebe?.id && typeof saveWhatsAppConfig === 'function') {
        saveWhatsAppConfig(cfg, contexto.bebe.id, contexto.dbClient || window.db);
      }
    }
  }

  if (enviadas > 0) {
    try {
      localStorage.setItem('nebu_alert_timestamps', JSON.stringify(rawLast));
    } catch {}
  }

  return { alertas, enviadas };
}

// Exportar globalmente para el cliente web
window.getWhatsAppConfig = getWhatsAppConfig;
window.saveWhatsAppConfig = saveWhatsAppConfig;
window.getWhatsAppConnectionState = getWhatsAppConnectionState;
window.getWhatsAppQR = getWhatsAppQR;
window.getWhatsAppGroups = getWhatsAppGroups;
window.normalizarDestinatario = normalizarDestinatario;
window.normalizarDestinatarios = normalizarDestinatarios;
window.enviarNotificacionWhatsApp = enviarNotificacionWhatsApp;
window.probarConexionWhatsApp = probarConexionWhatsApp;
window.evaluarAlertasRutina = evaluarAlertasRutina;
window.generarDatosInformeDiario = generarDatosInformeDiario;
window.construirMensajeInformeDiario = construirMensajeInformeDiario;
window.enviarInformeDiarioManual = enviarInformeDiarioManual;
window.verificarYDespacharAlertasWhatsApp = verificarYDespacharAlertasWhatsApp;
window.ALERT_COOLDOWNS = ALERT_COOLDOWNS;
window.NEBU_GROUP_JID = NEBU_GROUP_JID;

