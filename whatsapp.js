/* ============================================================
   NebuAppWeb — Módulo de Integración WhatsApp Gateway
   Servicio: Evolution API v2 (Baileys) en VPS rektressserver
   Envío de notificaciones colaborativas en tiempo real (No bloqueante)
   ============================================================ */

const DEFAULT_WSP_CONFIG = {
  enabled: false,
  apiUrl: 'https://rektressserver.tailda85b3.ts.net:8443',
  apiKey: 'NebuAppWspKey_2026_Secure!',
  instance: 'nebuapp',
  target: '', // Número telefónico (ej: 569XXXXXXXX) o ID de grupo familiar (ej: 1203630...@g.us)
  notifyTomas: true,
  notifyPanales: true,
  notifyVitaminas: true,
  notifySueno: true,
};

/**
 * Obtiene la configuración actual de WhatsApp combinando localStorage y datos sincronizados del bebé.
 */
function getWhatsAppConfig(bebe = null) {
  let localCfg = {};
  try {
    const raw = localStorage.getItem('nebu_wsp_config');
    if (raw) localCfg = JSON.parse(raw);
  } catch (e) {
    console.warn('Error leyendo configuración local de WhatsApp:', e);
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

  return { ...DEFAULT_WSP_CONFIG, ...bebeCfg, ...localCfg };
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
  if (!raw) return [];
  if (Array.isArray(raw)) raw = raw.join('\n');

  // Separar primero por saltos de línea, comas, punto y coma, pipes o slashes
  const tokens = String(raw).split(/[\n\r,;|/]+/);
  const result = [];

  for (let token of tokens) {
    token = token.trim();
    if (!token) continue;

    // 1. JID de grupo de WhatsApp (@g.us) o de usuario (@s.whatsapp.net)
    if (token.includes('@g.us') || token.includes('@s.whatsapp.net')) {
      const match = token.match(/([a-zA-Z0-9.\-_]+@(g\.us|s\.whatsapp\.net))/);
      if (match) result.push(match[1]);
      continue;
    }

    // 2. Si contiene múltiples '+' (ej: +56944830378 +56950192577)
    if (token.includes('+')) {
      const subTokens = token.split(/(?=\+)/).filter(Boolean);
      for (const st of subTokens) {
        const cleaned = st.replace(/[^\d]/g, '');
        if (cleaned.length >= 8 && cleaned.length <= 15) {
          result.push(limpiarNumeroTelefono(cleaned));
        }
      }
      continue;
    }

    // 3. Detectar patrones de celulares chilenos (569XXXXXXXX o 9XXXXXXXX)
    // Resuelve casos donde se ingresaron con espacios o sin separación: '56944830378 56950192577' o '5694483037856950192577'
    const matchesChilean = token.match(/(?:56)?9\d{8}/g);
    if (matchesChilean && matchesChilean.length > 0) {
      for (const m of matchesChilean) {
        result.push(limpiarNumeroTelefono(m));
      }
      continue;
    }

    // 4. Caso numérico genérico (8 a 15 dígitos según norma internacional E.164)
    const digitsOnly = token.replace(/[^\d]/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      result.push(limpiarNumeroTelefono(digitsOnly));
    }
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

  const targets = normalizarDestinatarios(cfg.target);
  if (targets.length === 0) return;

  // Filtrado de eventos según preferencias
  if (tipo === 'tomas' && !cfg.notifyTomas) return;
  if (tipo === 'panales' && !cfg.notifyPanales) return;
  if ((tipo === 'vitaminas' || tipo === 'vitaminas_tipos') && !cfg.notifyVitaminas) return;
  if ((tipo === 'sueno' || tipo === 'sueno_inicio' || tipo === 'sueno_fin') && !cfg.notifySueno) return;

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
