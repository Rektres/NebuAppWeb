/* ============================================================
   Rutinas del Bebé — lógica de la app (Vanilla JS + Supabase)
   ============================================================ */

// Credenciales de Supabase: vienen de config.js (window.ENV).
// Local: copia config.example.js como config.js. GitHub Pages: se genera
// en el workflow de Actions desde los Secrets SUPABASE_URL / SUPABASE_ANON_KEY.
const ENV = window.ENV || {};
const configurado = ENV.SUPABASE_URL && !ENV.SUPABASE_URL.includes('TU-PROYECTO');

const db = supabase.createClient(
  configurado ? ENV.SUPABASE_URL : 'https://iseevvlfdjdsrxtxicvu.supabase.co',
  ENV.SUPABASE_ANON_KEY || 'sb_publishable_vAGgN8aMen8mk6NRU1qSwQ_McgBI603'
);
window.db = db;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G_POR_ML = 4.3 / 30; // gramos de fórmula por cada ml (4,3 g cada 30 ml)
const dtLocal = (d) => `${dayKey(d)}T${fmtTime(d)}`; // valor para inputs datetime-local

const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function fmtDur(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDayLabel(key) {
  const hoy = dayKey(new Date());
  const ayer = dayKey(new Date(Date.now() - 86400000));
  const d = new Date(key + 'T12:00');
  const fecha = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
  if (key === hoy) return `Hoy · ${fecha}`;
  if (key === ayer) return `Ayer · ${fecha}`;
  return fecha.charAt(0).toUpperCase() + fecha.slice(1);
}

function groupByDay(rows, field) {
  const map = new Map();
  for (const r of rows || []) {
    const raw = r[field];
    if (!raw) continue;
    const k = (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw))
      ? raw
      : dayKey(new Date(raw));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// ---------- Agrupación semanal y mensual del historial ----------
const mesActualKey = () => dayKey(new Date()).slice(0, 7);
const mesKeyDe = (dk) => dk.slice(0, 7);

function fmtMesLabel(mk) {
  const d = new Date(`${mk}-01T12:00`);
  const txt = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function semanaDelMes(dayK) {
  const d = new Date(`${dayK}T12:00`);
  const dia = d.getDate();
  return Math.floor((dia - 1) / 7) + 1; // 1..5
}

function semanaLabel(mesKey, semNum) {
  const [y, m] = mesKey.split('-').map(Number);
  const diasEnMes = new Date(y, m, 0).getDate();
  const dIni = (semNum - 1) * 7 + 1;
  const dFin = Math.min(diasEnMes, semNum * 7);
  const dObj = new Date(y, m - 1, dIni, 12, 0);
  const mesTxt = dObj.toLocaleDateString('es', { month: 'short' });
  return `Semana ${semNum} · ${dIni} al ${dFin} de ${mesTxt}`;
}

// Agrupa días ordenados descendentemente en Meses y Semanas del Mes
function agruparPorMesYSemana(diasOrdenados) {
  const actualMes = mesActualKey();
  const hoyK = dayKey(new Date());
  const hoySemNum = semanaDelMes(hoyK);
  const hoySemKey = `${actualMes}-s${hoySemNum}`;

  const meses = [];
  for (const [dk, payload] of diasOrdenados) {
    const mk = mesKeyDe(dk);
    let grupoMes = meses[meses.length - 1];
    if (!grupoMes || grupoMes.mes !== mk) {
      grupoMes = { mes: mk, actual: mk === actualMes, semanas: [] };
      meses.push(grupoMes);
    }

    const semNum = semanaDelMes(dk);
    const semKey = `${mk}-s${semNum}`;
    let grupoSem = grupoMes.semanas[grupoMes.semanas.length - 1];
    if (!grupoSem || grupoSem.key !== semKey) {
      grupoSem = {
        key: semKey,
        num: semNum,
        mes: mk,
        label: semanaLabel(mk, semNum),
        actual: semKey === hoySemKey,
        dias: [],
      };
      grupoMes.semanas.push(grupoSem);
    }
    grupoSem.dias.push([dk, payload]);
  }
  return meses;
}

function toISO(fecha, hora) {
  return new Date(`${fecha}T${hora}`).toISOString();
}

function esErrorPausaSupabase(err) {
  if (!err) return false;
  const str = typeof err === 'string' ? err : `${err.message || ''} ${err.code || ''} ${err.details || ''}`;
  return /schema cache|PGRST002|service unavailable/i.test(str);
}

const MENSAJE_PAUSA_SUPABASE = '⚠️ Base de datos pausada en Supabase por inactividad. Ingresa al panel de Supabase y pulsa "Restore Project" para reactivarla.';

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  if (esErrorPausaSupabase(msg)) {
    msg = MENSAJE_PAUSA_SUPABASE;
    isError = true;
  }
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), typeof msg === 'string' && msg.includes('Supabase') ? 9000 : 3200);
}

function setNowDefaults() {
  const now = new Date();
  const f = dayKey(now), h = fmtTime(now);
  for (const id of ['vitFecha', 'suenoFecha', 'panFechaHora', 'lecheFechaHora']) {
    if ($(id)) {
      if (id.includes('FechaHora')) $(id).value = dtLocal(now);
      else $(id).value = f;
    }
  }
  if ($('vitHora')) $('vitHora').value = h;
  if ($('suenoInicio')) $('suenoInicio').value = h;
  if ($('suenoFin')) $('suenoFin').value = h;
  if ($('vitTipoFecha')) $('vitTipoFecha').value = f;
  if ($('vitTipoHora')) $('vitTipoHora').value = h;
  if ($('comidaFecha')) $('comidaFecha').value = f;
  if ($('comidaHora')) $('comidaHora').value = h;
}

// ---------- Estado ----------
const cache = {
  tomas: null,
  vitaminas: null,
  panales: null,
  sueno: null,
  vitaminas_tipos: null,
  vitaminas_tipos_log: null,
  miembros: null,
  bitacora: null,
  juegos: null,
};

let bebe = null;
let miRol = null;
let usuario = null;
let currentTab = 'stats';
let statsDirty = true;
let appStarted = false;

// ---------- Datos ----------
const ORDEN = {
  sueno: 'inicio',
  vitaminas_tipos: 'id',
  vitaminas_tipos_log: 'fecha',
  miembros: 'created_at',
  bitacora: 'fecha',
  juegos: 'fecha',
};

async function loadData(tabla) {
  if (!bebe?.id) return;
  const col = ORDEN[tabla] || 'fecha_hora';
  const { data, error } = await db
    .from(tabla)
    .select('*')
    .eq('bebe_id', bebe.id)
    .order(col, { ascending: false })
    .limit(500);
  if (error) toast(`Error cargando ${tabla}: ${error.message}`, true);
  else cache[tabla] = data || [];
}

async function loadAll() {
  await Promise.all(['tomas', 'vitaminas', 'panales', 'sueno', 'vitaminas_tipos', 'vitaminas_tipos_log', 'miembros', 'bitacora', 'juegos'].map(loadData));
  statsDirty = true;
}

async function insertar(tabla, valores) {
  valores.bebe_id = bebe.id;
  const { error } = await db.from(tabla).insert(valores);
  if (error) { toast(`Error al guardar: ${error.message}`, true); return false; }
  await loadData(tabla);
  statsDirty = true;
  toast('Registro guardado ✓');
  if (typeof window.enviarNotificacionWhatsApp === 'function') {
    window.enviarNotificacionWhatsApp(tabla, valores, { bebe, miRol });
  }
  if (typeof actualizarAlertasYBadge === 'function') {
    await actualizarAlertasYBadge();
  }
  return true;
}

async function eliminar(tabla, id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await db.from(tabla).delete().eq('id', id);
  if (error) { toast(`Error al eliminar: ${error.message}`, true); return; }
  if (tabla === 'panales') {
    await guardarBristolEnMapa(id, null);
  }
  await loadData(tabla);
  statsDirty = true;
  if (typeof actualizarAlertasYBadge === 'function') {
    await actualizarAlertasYBadge();
  }
  renderTab(currentTab);
}

// Delegación de clicks para botones ✏️/🗑
document.addEventListener('click', (e) => {
  const del = e.target.closest('.del-btn');
  if (del) { eliminar(del.dataset.tabla, del.dataset.id); return; }
  const ed = e.target.closest('.edit-btn');
  if (ed) {
    if (ed.dataset.tabla === 'juegos') cargarJuego(ed.dataset.id);
    else abrirEdicion(ed.dataset.tabla, ed.dataset.id);
  }
});

// ---------- Render de tablas con colapso por Semana y Mes ----------
function tablaHTML(headers, grupos, filaFn, subtotalFn, subtotalMesFn) {
  if (!grupos.size) return '<p class="empty-msg">Sin registros todavía</p>';
  const cols = headers.length + 1;
  const hoy = dayKey(new Date());
  const meses = agruparPorMesYSemana([...grupos.entries()]);
  let html = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}<th></th></tr></thead><tbody>`;

  for (const grupoMes of meses) {
    if (grupoMes.actual) {
      // Mes actual: se muestran directamente sus semanas
      for (const sem of grupoMes.semanas) {
        const semAbierta = sem.actual;
        html += `<tr class="week-row week-toggle${semAbierta ? ' abierto' : ''}" data-week="${sem.key}"><td colspan="${cols}"><div class="row-header-wrap"><span><span class="caret">${semAbierta ? '▾' : '▸'}</span> <strong>${sem.label}</strong></span></div></td></tr>`;
        for (const [key, rows] of sem.dias) {
          const diaAbierto = semAbierta && key === hoy;
          const subtotal = subtotalFn ? `<span class="subtotal-badge">${subtotalFn(rows)}</span>` : '';
          html += `<tr class="day-row day-toggle w-${sem.key}${semAbierta ? '' : ' hidden'}${diaAbierto ? ' abierto' : ''}" data-day="${key}"><td colspan="${cols}"><div class="row-header-wrap"><span><span class="caret">${diaAbierto ? '▾' : '▸'}</span> ${fmtDayLabel(key)}</span>${subtotal}</div></td></tr>`;
          html += rows.map(filaFn).map((tr) => tr.replace('<tr>', `<tr class="drow d-${key} w-${sem.key}${diaAbierto ? '' : ' hidden'}">`)).join('');
        }
      }
    } else {
      // Mes completado: colapsado en un renglón mensual
      const todasFilas = grupoMes.semanas.flatMap((s) => s.dias.flatMap(([, rows]) => rows));
      const subtotalMes = subtotalMesFn ? `<span class="subtotal-badge">${subtotalMesFn(todasFilas)}</span>` : '';
      html += `<tr class="month-row month-toggle" data-month="${grupoMes.mes}"><td colspan="${cols}"><div class="row-header-wrap"><span><span class="caret">▸</span> <strong>${fmtMesLabel(grupoMes.mes)}</strong></span>${subtotalMes}</div></td></tr>`;
      for (const sem of grupoMes.semanas) {
        html += `<tr class="week-row week-toggle m-${grupoMes.mes} hidden" data-week="${sem.key}"><td colspan="${cols}"><div class="row-header-wrap"><span><span class="caret">▸</span> ${sem.label}</span></div></td></tr>`;
        for (const [key, rows] of sem.dias) {
          const subtotal = subtotalFn ? `<span class="subtotal-badge">${subtotalFn(rows)}</span>` : '';
          html += `<tr class="day-row day-toggle m-${grupoMes.mes} w-${sem.key} hidden" data-day="${key}"><td colspan="${cols}"><div class="row-header-wrap"><span><span class="caret">▸</span> ${fmtDayLabel(key)}</span>${subtotal}</div></td></tr>`;
          html += rows.map(filaFn).map((tr) => tr.replace('<tr>', `<tr class="drow d-${key} m-${grupoMes.mes} w-${sem.key} hidden">`)).join('');
        }
      }
    }
  }
  return html + '</tbody></table>';
}

function historialColapsable(rows, keyFn, itemHTML) {
  if (!rows.length) return '<p class="empty-msg">Sin registros todavía</p>';
  const hoy = dayKey(new Date());
  const grupos = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const meses = agruparPorMesYSemana([...grupos.entries()]);
  let html = '<div class="col-list">';

  for (const grupoMes of meses) {
    if (grupoMes.actual) {
      for (const sem of grupoMes.semanas) {
        const semAbierta = sem.actual;
        html += `<div class="col-week week-toggle${semAbierta ? ' abierto' : ''}" data-week="${sem.key}"><span class="caret">${semAbierta ? '▾' : '▸'}</span> <strong>${sem.label}</strong></div>`;
        for (const [key, items] of sem.dias) {
          const diaAbierto = semAbierta && key === hoy;
          html += `<div class="col-day day-toggle w-${sem.key}${semAbierta ? '' : ' hidden'}${diaAbierto ? ' abierto' : ''}" data-day="${key}"><span class="caret">${diaAbierto ? '▾' : '▸'}</span> ${fmtDayLabel(key)}</div>`;
          html += items.map((r) => `<div class="drow d-${key} w-${sem.key}${diaAbierto ? '' : ' hidden'}">${itemHTML(r)}</div>`).join('');
        }
      }
    } else {
      html += `<div class="col-month month-toggle" data-month="${grupoMes.mes}"><span class="caret">▸</span> <strong>${fmtMesLabel(grupoMes.mes)}</strong></div>`;
      for (const sem of grupoMes.semanas) {
        html += `<div class="col-week week-toggle m-${grupoMes.mes} hidden" data-week="${sem.key}"><span class="caret">▸</span> ${sem.label}</div>`;
        for (const [key, items] of sem.dias) {
          html += `<div class="col-day day-toggle m-${grupoMes.mes} w-${sem.key} hidden" data-day="${key}"><span class="caret">▸</span> ${fmtDayLabel(key)}</div>`;
          html += items.map((r) => `<div class="drow d-${key} m-${grupoMes.mes} w-${sem.key} hidden">${itemHTML(r)}</div>`).join('');
        }
      }
    }
  }
  return html + '</div>';
}

function historialChecklistHTML(dias, itemsDelDiaFn, colspan) {
  if (!dias.length) return '<p class="empty-msg">Sin registros todavía</p>';
  const hoyKey = dayKey(new Date());
  const meses = agruparPorMesYSemana(dias.map((d) => [d, d]));
  let html = '';

  for (const grupoMes of meses) {
    if (grupoMes.actual) {
      for (const sem of grupoMes.semanas) {
        const semAbierta = sem.actual;
        html += `<tr class="week-row week-toggle${semAbierta ? ' abierto' : ''}" data-week="${sem.key}"><td colspan="${colspan}"><span class="caret">${semAbierta ? '▾' : '▸'}</span> <strong>${sem.label}</strong></td></tr>`;
        for (const [d] of sem.dias) {
          const diaAbierto = semAbierta && d === hoyKey;
          html += `<tr class="day-row day-toggle w-${sem.key}${semAbierta ? '' : ' hidden'}${diaAbierto ? ' abierto' : ''}" data-day="${d}"><td colspan="${colspan}"><span class="caret">${diaAbierto ? '▾' : '▸'}</span> ${fmtDayLabel(d)}</td></tr>`;
          html += itemsDelDiaFn(d).map((tr) => tr.replace('<tr>', `<tr class="drow d-${d} w-${sem.key}${diaAbierto ? '' : ' hidden'}">`)).join('');
        }
      }
    } else {
      html += `<tr class="month-row month-toggle" data-month="${grupoMes.mes}"><td colspan="${colspan}"><span class="caret">▸</span> <strong>${fmtMesLabel(grupoMes.mes)}</strong></td></tr>`;
      for (const sem of grupoMes.semanas) {
        html += `<tr class="week-row week-toggle m-${grupoMes.mes} hidden" data-week="${sem.key}"><td colspan="${colspan}"><span class="caret">▸</span> ${sem.label}</td></tr>`;
        for (const [d] of sem.dias) {
          html += `<tr class="day-row day-toggle m-${grupoMes.mes} w-${sem.key} hidden" data-day="${d}"><td colspan="${colspan}"><span class="caret">▸</span> ${fmtDayLabel(d)}</td></tr>`;
          html += itemsDelDiaFn(d).map((tr) => tr.replace('<tr>', `<tr class="drow d-${d} m-${grupoMes.mes} w-${sem.key} hidden">`)).join('');
        }
      }
    }
  }
  return `<table><tbody>${html}</tbody></table>`;
}

// Handler interactivo para colapso de Mes, Semana y Día
document.addEventListener('click', (e) => {
  const dt = e.target.closest('.day-toggle');
  if (dt) {
    const abierto = dt.classList.toggle('abierto');
    const caret = dt.querySelector('.caret');
    if (caret) caret.textContent = abierto ? '▾' : '▸';
    dt.closest('table, .col-list').querySelectorAll('.d-' + CSS.escape(dt.dataset.day)).forEach((r) => r.classList.toggle('hidden', !abierto));
    return;
  }

  const wt = e.target.closest('.week-toggle');
  if (wt) {
    const abierto = wt.classList.toggle('abierto');
    const caret = wt.querySelector('.caret');
    if (caret) caret.textContent = abierto ? '▾' : '▸';
    const cont = wt.closest('table, .col-list');
    const wClass = '.w-' + CSS.escape(wt.dataset.week);
    cont.querySelectorAll(wClass).forEach((el) => {
      if (el.classList.contains('day-toggle')) {
        el.classList.toggle('hidden', !abierto);
        if (!abierto) {
          el.classList.remove('abierto');
          const dCaret = el.querySelector('.caret');
          if (dCaret) dCaret.textContent = '▸';
          cont.querySelectorAll('.d-' + CSS.escape(el.dataset.day)).forEach((r) => r.classList.add('hidden'));
        }
      } else if (el.classList.contains('drow')) {
        if (!abierto) el.classList.add('hidden');
      }
    });
    return;
  }

  const mt = e.target.closest('.month-toggle');
  if (mt) {
    const abierto = mt.classList.toggle('abierto');
    const caret = mt.querySelector('.caret');
    if (caret) caret.textContent = abierto ? '▾' : '▸';
    const cont = mt.closest('table, .col-list');
    const mClass = '.m-' + CSS.escape(mt.dataset.month);
    cont.querySelectorAll(mClass).forEach((el) => {
      if (el.classList.contains('week-toggle')) {
        el.classList.toggle('hidden', !abierto);
        if (!abierto) {
          el.classList.remove('abierto');
          const wCaret = el.querySelector('.caret');
          if (wCaret) wCaret.textContent = '▸';
        }
      } else if (el.classList.contains('day-toggle') || el.classList.contains('drow')) {
        el.classList.add('hidden');
        if (el.classList.contains('day-toggle')) {
          el.classList.remove('abierto');
          const dCaret = el.querySelector('.caret');
          if (dCaret) dCaret.textContent = '▸';
        }
      }
    });
    return;
  }
});

const accionesTd = (tabla, id) => `<td class="acciones-cell"><button class="edit-btn" data-tabla="${tabla}" data-id="${id}" title="Editar">✏️</button><button class="del-btn" data-tabla="${tabla}" data-id="${id}" title="Eliminar">🗑</button></td>`;
const botonesEdit = (tabla, id) => `<button class="edit-btn" data-tabla="${tabla}" data-id="${id}" title="Editar">✏️</button><button class="del-btn" data-tabla="${tabla}" data-id="${id}" title="Eliminar">🗑</button>`;

// ---------- Tomas de Leche ----------
function renderLeche() {
  renderLecheResumen();
  $('tablaLeche').innerHTML = tablaHTML(
    ['Hora', 'Cantidad'],
    groupByDay(cache.tomas || [], 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.cantidad_ml} ml</td>${accionesTd('tomas', r.id)}</tr>`,
    (rows) => `${rows.reduce((s, r) => s + r.cantidad_ml, 0)} ml`,
    (rows) => `${rows.reduce((s, r) => s + r.cantidad_ml, 0)} ml`
  );
}

function renderLecheResumen() {
  const hoy = dayKey(new Date());
  const tomasHoy = (cache.tomas || []).filter((r) => dayKey(new Date(r.fecha_hora)) === hoy);
  const totalHoy = tomasHoy.reduce((s, r) => s + r.cantidad_ml, 0);
  const objetivo = Number(localStorage.getItem('objetivo_leche')) || 800;
  
  $('objetivoInput').value = objetivo;
  $('lecheHoy').textContent = totalHoy;
  $('lecheProgress').style.width = Math.min(100, (totalHoy / objetivo) * 100) + '%';
  $('lecheStatus').textContent =
    totalHoy >= objetivo
      ? `🎉 ¡Meta cumplida! (+${totalHoy - objetivo} ml sobre el objetivo)`
      : `Faltan ${objetivo - totalHoy} ml para el objetivo 🎯`;

  // Cálculo histórico de tarros abiertos y fórmula acumulada
  const totalHistoricoMl = (cache.tomas || []).reduce((s, r) => s + r.cantidad_ml, 0);
  const totalHistoricoGr = totalHistoricoMl * G_POR_ML;
  const lataGramos = Number(bebe?.lata_gramos) || 800;

  const tarrosAbiertos = totalHistoricoGr > 0 ? Math.ceil(totalHistoricoGr / lataGramos) : 0;
  const tarrosCompletados = Math.floor(totalHistoricoGr / lataGramos);
  const usadoTarroActualGr = Math.round(totalHistoricoGr - (tarrosCompletados * lataGramos));
  const restanteTarroActualGr = Math.max(0, lataGramos - usadoTarroActualGr);
  const porcentajeRestante = Math.round((restanteTarroActualGr / lataGramos) * 100);

  $('tarrosAbiertosVal').textContent = tarrosAbiertos;
  $('formulaTotalTxt').textContent = `${Math.round(totalHistoricoGr)} g (${totalHistoricoMl} ml)`;
  $('tarroActualTxt').textContent = `${restanteTarroActualGr} g restantes (${porcentajeRestante}%)`;
  $('tarroProgress').style.width = porcentajeRestante + '%';
  $('lataInput').value = lataGramos;

  const abierta = bebe?.lata_abierta_en ? new Date(bebe.lata_abierta_en).getTime() : 0;
  if (document.activeElement !== $('lataAbiertaInput')) {
    $('lataAbiertaInput').value = dtLocal(abierta ? new Date(abierta) : new Date());
  }

  $('lataStatus').textContent = tarrosAbiertos > 0
    ? `Tarro #${tarrosAbiertos} en uso · ${usadoTarroActualGr} g consumidos de este tarro · ${tarrosCompletados} tarro${tarrosCompletados === 1 ? '' : 's'} terminado${tarrosCompletados === 1 ? '' : 's'} en total`
    : 'Sin registros de tomas aún';

  const rows = cache.tomas || [];
  if (!rows.length) {
    $('ultimaTomaHace').textContent = '—';
    $('ultimaToma').textContent = 'Sin registros';
  } else {
    const ult = new Date(rows[0].fecha_hora);
    $('ultimaTomaHace').textContent = fmtDur(Math.max(0, (Date.now() - ult) / 60000));
    $('ultimaToma').textContent =
      ult.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ', ' + fmtTime(ult) + ` · ${rows[0].cantidad_ml} ml`;
  }
}

// ---------- Vitaminas ----------
function renderVitaminas() {
  renderVitaminaTipos();
  $('tablaVitaminas').innerHTML = tablaHTML(
    ['Hora', 'Gotas'],
    groupByDay(cache.vitaminas || [], 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.gotas} gotas</td>${accionesTd('vitaminas', r.id)}</tr>`,
    (rows) => `${rows.reduce((s, r) => s + r.gotas, 0)} gotas`,
    (rows) => `${rows.reduce((s, r) => s + r.gotas, 0)} gotas`
  );
}

const ordenarVitaminaTipos = (lista) => lista.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

function renderVitaminaTipos() {
  const lista = ordenarVitaminaTipos(cache.vitaminas_tipos || []);
  const fechaSel = $('vitTipoFecha')?.value || dayKey(new Date());
  $('vitTipoHoy').innerHTML = lista.length
    ? lista.map((v) => {
        const row = (cache.vitaminas_tipos_log || []).find((l) => l.fecha === fechaSel && String(l.vitamina_id) === String(v.id));
        const tomada = Boolean(row);
        const detalle = row ? `(${row.gotas ?? v.gotas_default ?? 5}g${row.hora ? ' · ' + row.hora.slice(0, 5) : ''})` : `(${v.gotas_default || 5}g)`;
        return `<button type="button" class="past-btn${tomada ? ' tomada' : ''}" data-id="${v.id}">${tomada ? '✓' : '＋'} ${escapeHtml(v.nombre)} <small>${detalle}</small></button>`;
      }).join('')
    : '<p class="empty-msg">Agrega vitaminas a tu lista abajo</p>';

  $('vitTipoLista').innerHTML = lista.length
    ? `<table><tbody>${lista.map((v) => `<tr><td>${escapeHtml(v.nombre)}</td><td>${v.gotas_default || 5} gotas</td>${accionesTd('vitaminas_tipos', v.id)}</tr>`).join('')}</tbody></table>`
    : '<p class="empty-msg">Aún no agregas vitaminas a tu lista</p>';

  const mapa = new Map((cache.vitaminas_tipos || []).map((v) => [String(v.id), v]));
  const logs = cache.vitaminas_tipos_log || [];
  const grupos = new Map();

  // Ordenar logs descendentemente por fecha y luego por hora
  const logsOrdenados = [...logs].sort((a, b) => {
    const fComp = (b.fecha || '').localeCompare(a.fecha || '');
    if (fComp !== 0) return fComp;
    return (b.hora || '').localeCompare(a.hora || '');
  });

  for (const l of logsOrdenados) {
    const f = l.fecha;
    if (!f) continue;
    if (!grupos.has(f)) grupos.set(f, []);
    grupos.get(f).push(l);
  }

  $('tablaVitaminaTipos').innerHTML = tablaHTML(
    ['Vitamina', 'Dosis / Hora'],
    grupos,
    (l) => {
      const v = mapa.get(String(l.vitamina_id));
      const nombre = v ? v.nombre : 'Vitamina';
      const gotas = l.gotas ?? v?.gotas_default ?? 5;
      const horaTxt = l.hora ? ` · ${l.hora.slice(0, 5)}` : '';
      return `<tr><td><strong>${escapeHtml(nombre)}</strong></td><td>${gotas} gotas ✅${horaTxt}</td>${accionesTd('vitaminas_tipos_log', l.id)}</tr>`;
    },
    (rows) => `${rows.length} dosis (${rows.reduce((s, r) => s + (r.gotas || 5), 0)} gotas)`,
    (rows) => `${rows.length} dosis (${rows.reduce((s, r) => s + (r.gotas || 5), 0)} gotas)`
  );
}

// Selector de fecha en checklist de vitaminas
$('vitTipoFecha')?.addEventListener('change', () => {
  renderVitaminaTipos();
});

// Toggle vitamina en checklist con protección contra clics repetidos
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.past-btn');
  if (!btn || !btn.dataset.id) return;
  if (btn.disabled) return;
  btn.disabled = true;

  try {
    const vitId = Number(btn.dataset.id);
    const fecha = $('vitTipoFecha').value || dayKey(new Date());
    const hora = ($('vitTipoHora').value || fmtTime(new Date())) + ':00';
    const yaTomada = btn.classList.contains('tomada');
    const v = (cache.vitaminas_tipos || []).find((x) => x.id === vitId);
    const gotas = v?.gotas_default || 5;

    if (!yaTomada) {
      await db.from('vitaminas_tipos_log').upsert({ bebe_id: bebe.id, vitamina_id: vitId, fecha, hora, gotas }, { onConflict: 'vitamina_id,fecha' });
      if (typeof window.enviarNotificacionWhatsApp === 'function') {
        window.enviarNotificacionWhatsApp('vitaminas_tipos', {
          nombre: v?.nombre || 'Vitamina',
          gotas,
          hora,
        }, { bebe, miRol });
      }
    } else {
      await db.from('vitaminas_tipos_log').delete().eq('vitamina_id', vitId).eq('fecha', fecha);
    }
    await loadData('vitaminas_tipos_log');
    statsDirty = true;
    renderVitaminaTipos();
    if (typeof actualizarAlertasYBadge === 'function') {
      actualizarAlertasYBadge();
    }
  } finally {
    btn.disabled = false;
  }
});

// Sugerencias rápidas de vitaminas (+ Hierro, + B12, + Vitamina D)
document.addEventListener('click', async (e) => {
  const chip = e.target.closest('.chip-add-vit');
  if (!chip) return;
  if (chip.disabled) return;
  chip.disabled = true;

  try {
    const nombre = chip.dataset.nombre;
    const gotas = Number(chip.dataset.gotas) || 5;
    const yaExiste = (cache.vitaminas_tipos || []).some(
      (v) => (v.nombre || '').trim().toLowerCase() === nombre.trim().toLowerCase()
    );
    if (yaExiste) {
      toast(`"${nombre}" ya está en tu lista de vitaminas`);
      return;
    }
    const ok = await insertar('vitaminas_tipos', { nombre, gotas_default: gotas });
    if (ok) {
      toast(`"${nombre}" agregada ✓`);
      renderVitaminaTipos();
    }
  } finally {
    chip.disabled = false;
  }
});

async function asegurarVitaminasPredeterminadas() {
  if (!bebe?.id) return;
  const lista = cache.vitaminas_tipos || [];
  const nombres = lista.map((v) => (v.nombre || '').trim().toLowerCase());
  const porCrear = [];
  if (!nombres.some((n) => n.includes('hierro'))) {
    porCrear.push({ nombre: 'Hierro', gotas_default: 5 });
  }
  if (!nombres.some((n) => n.includes('b12'))) {
    porCrear.push({ nombre: 'B12', gotas_default: 5 });
  }
  if (lista.length === 0 && !nombres.some((n) => n.includes('vitamina'))) {
    porCrear.push({ nombre: 'Vitamina D', gotas_default: 5 });
  }
  if (porCrear.length > 0) {
    let hubonuevos = false;
    for (const v of porCrear) {
      const { error } = await db.from('vitaminas_tipos').insert({ bebe_id: bebe.id, ...v });
      if (!error) hubonuevos = true;
    }
    if (hubonuevos) {
      await loadData('vitaminas_tipos');
      renderVitaminaTipos();
    }
  }
}

// ---------- Pañales & Escala de Bristol Pediátrica ----------
const FECHA_MIN_BRISTOL = '2026-11-15';
const SYSTEM_BRISTOL_KEY = '__bristol_map__';

const BRISTOL_DATA = [
  {
    tipo: 1,
    corto: 'Bolitas duras',
    color: '#81a855',
    cara: '😣',
    desc: 'Heces en bolas duras y separadas, como frutos secos.',
    estado: 'Puede indicar estreñimiento. Tu peque puede tener dificultad para evacuar.',
    tip: 'Qué falta para mejorar: Ofrecer más agua durante el día (según edad), sumar frutas laxantes ricas en agua y fibra (ciruela, pera, kiwi) y grasas saludables (palta, aceite de oliva).',
    svg: '<svg viewBox="0 0 64 36"><circle cx="14" cy="14" r="5" fill="#7c4a26" stroke="#4e2c14" stroke-width="1.4"/><circle cx="29" cy="10" r="4.8" fill="#8b552c" stroke="#4e2c14" stroke-width="1.4"/><circle cx="44" cy="14" r="5" fill="#7c4a26" stroke="#4e2c14" stroke-width="1.4"/><circle cx="21" cy="25" r="4.6" fill="#6f4120" stroke="#4e2c14" stroke-width="1.4"/><circle cx="37" cy="25" r="5.2" fill="#8b552c" stroke="#4e2c14" stroke-width="1.4"/><circle cx="51" cy="24" r="4.5" fill="#7c4a26" stroke="#4e2c14" stroke-width="1.4"/></svg>',
  },
  {
    tipo: 2,
    corto: 'Bolas agrupadas',
    color: '#58a782',
    cara: '😕',
    desc: 'Heces con forma alargada, pero con relieves, como bolas unidas.',
    estado: 'Puede indicar estreñimiento leve o tránsito intestinal lento.',
    tip: 'Qué falta para mejorar: Aumentar hidratación con agua, incorporar verduras verdes cocidas (espinaca, zapallo italiano), avena bien hidratada y ciruela/pera.',
    svg: '<svg viewBox="0 0 64 36"><g fill="#8b552c" stroke="#4e2c14" stroke-width="1.3"><circle cx="14" cy="18" r="6.2"/><circle cx="23" cy="13" r="6"/><circle cx="24" cy="23" r="5.8"/><circle cx="33" cy="16" r="6.5"/><circle cx="42" cy="13" r="5.8"/><circle cx="42" cy="23" r="5.8"/><circle cx="51" cy="18" r="6"/></g></svg>',
  },
  {
    tipo: 3,
    corto: 'Con grietas',
    color: '#5c95c2',
    cara: '🙂',
    desc: 'Heces con forma alargada, con grietas en la superficie.',
    estado: 'Normal, pero podría mejorar su hidratación.',
    tip: 'Qué falta para mejorar: Asegúrate de que beba suficiente agua a lo largo del día y mantén un buen aporte diario de verduras, frutas frescas y grasas saludables.',
    svg: '<svg viewBox="0 0 64 36"><rect x="7" y="10" width="50" height="16" rx="8" fill="#935c31" stroke="#533015" stroke-width="1.5"/><path d="M16 11l3 5-2 4m11-10l-2 6 3 5m11-10l2 5-3 6m10-10l-2 5" fill="none" stroke="#4b2910" stroke-width="1.4" stroke-linecap="round"/></svg>',
  },
  {
    tipo: 4,
    corto: 'Lisa y suave',
    color: '#9683c6',
    cara: '😊',
    desc: 'Heces con forma alargada como una salchicha, lisa y blanda.',
    estado: '¡Ideal! Heces saludables y fáciles de evacuar.',
    tip: 'Recomendación: ¡Excelente equilibrio digestivo! No le falta nada; mantén esta hidratación y la rotación variada de los 5 grupos de alimentos.',
    svg: '<svg viewBox="0 0 64 36"><path d="M8 17c4-6 14-7 25-4 10 3 19 3 23 0 2 3 1 8-4 10-7 3-17 1-27-1-10-2-15 1-17-5z" fill="#a26839" stroke="#5c3618" stroke-width="1.5"/><path d="M15 16c9-2 17 0 27 2" fill="none" stroke="#c38856" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/></svg>',
  },
  {
    tipo: 5,
    corto: 'Trozos blandos',
    color: '#d9a441',
    cara: '😐',
    desc: 'Heces blandas y trozos separados o con bordes definidos.',
    estado: 'Podría ser normal, pero vigila si se repite en varias deposiciones.',
    tip: 'Qué ajustar: Si se vuelve frecuente, falta fibra soluble para dar mayor cohesión (avena cocida, plátano maduro, papa, zapallo amarillo o arroz).',
    svg: '<svg viewBox="0 0 64 36"><path d="M11 12c4-2 8 1 7 5s-6 5-8 2 0-6 1-7zm17-2c5-1 8 3 6 7-2 3-7 3-8 0s-1-6 2-7zm17 3c5-2 10 2 8 6-2 3-8 3-10 0s0-5 2-6zm-26 11c5-2 9 1 8 5-2 4-8 3-9 0s-1-4 1-5zm20 1c4-2 8 1 7 5s-7 4-8 1 0-5 1-6z" fill="#b17440" stroke="#68401c" stroke-width="1.3"/></svg>',
  },
  {
    tipo: 6,
    corto: 'Trozos pegados',
    color: '#df6f94',
    cara: '😟',
    desc: 'Heces blandas y trozos separados o con bordes pegados, tipo puré.',
    estado: 'Puede indicar tránsito intestinal acelerado.',
    tip: 'Qué falta para mejorar: Reforzar hidratación frecuente, ofrecer alimentos que den consistencia (arroz, papa, zanahoria o manzana cocida, plátano) y vigilar si algún alimento nuevo cayó pesado.',
    svg: '<svg viewBox="0 0 64 36"><path d="M11 22c-3-4 2-9 7-8 2-4 9-5 13-2 4-3 11-2 13 2 5-1 10 3 7 8 2 4-3 7-8 6-4 3-10 2-13 0-4 3-10 2-13 0-5 1-9-2-6-6z" fill="#c08244" stroke="#75491e" stroke-width="1.4"/><circle cx="24" cy="18" r="2.2" fill="#8f5b29"/><circle cx="38" cy="19" r="2.4" fill="#8f5b29"/><circle cx="31" cy="23" r="1.8" fill="#8f5b29"/></svg>',
  },
  {
    tipo: 7,
    corto: 'Líquidas',
    color: '#e05b6d',
    cara: '😣',
    desc: 'Heces líquidas, sin trozos sólidos.',
    estado: 'Puede indicar diarrea. Requiere vigilancia e hidratación continua.',
    tip: 'Qué hacer / falta: Prioriza hidratación constante (leche materna/fórmula habitual o agua), suspende temporalmente alimentos nuevos laxantes y consulta a tu pediatra si persiste, rechaza tomas o presenta fiebre.',
    svg: '<svg viewBox="0 0 64 36"><path d="M12 18c-3-3 3-7 9-6 4-4 14-4 19-1 6-2 13 1 11 5 5 2 3 8-4 8-5 4-15 4-21 1-6 3-14 0-12-4-4 0-5-2-2-3z" fill="#d39c4c" stroke="#8b5f1e" stroke-width="1.4"/><circle cx="19" cy="18" r="2" fill="#e9bd72"/><circle cx="36" cy="20" r="2.5" fill="#e9bd72"/><circle cx="48" cy="13" r="2.2" fill="#d39c4c"/></svg>',
  },
];

let selectedBristol = null;

function fechaIsoLocal(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val) && !val.includes('T') && !val.includes('Z')) {
    return val.slice(0, 10);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : dayKey(d);
}

function aplicaBristol(fechaVal) {
  const f = fechaIsoLocal(fechaVal);
  return Boolean(f && f >= FECHA_MIN_BRISTOL);
}

function leerBristolMap() {
  const rec = (cache.bitacora || []).find((r) => r.titulo === SYSTEM_BRISTOL_KEY);
  if (!rec?.notas) return {};
  try {
    const parsed = JSON.parse(rec.notas);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function guardarBristolEnMapa(panalId, bristolVal) {
  if (!bebe?.id || panalId == null) return;
  const mapa = { ...leerBristolMap() };
  if (bristolVal >= 1 && bristolVal <= 7) {
    mapa[String(panalId)] = Number(bristolVal);
  } else {
    delete mapa[String(panalId)];
  }
  const notasStr = JSON.stringify(mapa);
  const today = dayKey(new Date());
  const rec = (cache.bitacora || []).find((r) => r.titulo === SYSTEM_BRISTOL_KEY);
  if (rec?.id) {
    await db.from('bitacora').update({ notas: notasStr, fecha: today }).eq('id', rec.id);
  } else {
    await db.from('bitacora').insert({ bebe_id: bebe.id, titulo: SYSTEM_BRISTOL_KEY, fecha: today, notas: notasStr });
  }
  await loadData('bitacora');

  // Sincronización opcional en columna nativa si fue migrada
  try {
    await db.from('panales').update({ bristol: bristolVal || null }).eq('id', panalId);
  } catch {}
}

function renderBristolSelector(containerGrid, containerLeyenda, valorActual, onSelect) {
  if (!containerGrid) return;
  containerGrid.innerHTML = BRISTOL_DATA.map((b) => `
    <button type="button" class="bristol-btn${Number(valorActual) === b.tipo ? ' selected' : ''}" data-bristol="${b.tipo}" style="--bristol-color:${b.color}">
      <span class="bristol-num">${b.tipo}</span>
      <span class="bristol-ico">${b.svg}</span>
      <span class="bristol-lbl">
        <strong>${b.corto}</strong>
        <span>${b.desc}</span>
      </span>
      <span class="bristol-face" aria-hidden="true">${b.cara}</span>
    </button>
  `).join('');

  const bSel = BRISTOL_DATA.find((b) => b.tipo === Number(valorActual));
  if (containerLeyenda) {
    if (bSel) {
      containerLeyenda.style.setProperty('--bristol-color', bSel.color);
      containerLeyenda.innerHTML = `
        <div class="bristol-leyenda-head">
          <span>${bSel.cara}</span>
          <span>Tipo ${bSel.tipo} — ${bSel.corto}: ${bSel.estado}</span>
        </div>
        <div class="bristol-tip">💡 <strong>Tip práctico:</strong> ${bSel.tip}</div>
      `;
      containerLeyenda.classList.remove('hidden');
    } else {
      containerLeyenda.innerHTML = '';
      containerLeyenda.classList.add('hidden');
    }
  }

  containerGrid.onclick = (e) => {
    const btn = e.target.closest('.bristol-btn');
    if (!btn) return;
    const val = Number(btn.dataset.bristol);
    onSelect(val);
    renderBristolSelector(containerGrid, containerLeyenda, val, onSelect);
  };
}

function actualizarVisibilidadBristolForm() {
  const wrap = $('bristolWrap');
  if (!wrap) return;
  const esHeces = $('panHeces')?.checked;
  const fhVal = $('panFechaHora')?.value || dtLocal(new Date());
  const mostrar = Boolean(esHeces && aplicaBristol(fhVal));
  wrap.classList.toggle('hidden', !mostrar);
  if (mostrar) {
    renderBristolSelector($('bristolGrid'), $('bristolLeyenda'), selectedBristol, (v) => {
      selectedBristol = v;
    });
  } else {
    selectedBristol = null;
  }
}

function renderPanales() {
  const rows = cache.panales || [];
  const bristolMap = leerBristolMap();
  if (!rows.length) {
    $('ultimoCambio').textContent = '—';
    $('ultimaFeca').textContent = 'Sin registros';
  } else {
    const ult = new Date(rows[0].fecha_hora);
    $('ultimoCambio').textContent = fmtDur(Math.max(0, (Date.now() - ult) / 60000));
    const ultFeca = rows.find((r) => r.heces);
    if (!ultFeca) {
      $('ultimaFeca').textContent = 'Sin fecas';
    } else {
      const dF = new Date(ultFeca.fecha_hora);
      $('ultimaFeca').textContent =
        dF.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) +
        ', ' + fmtTime(dF);
    }
  }

  $('tablaPanales').innerHTML = tablaHTML(
    ['Hora', 'Detalle'],
    groupByDay(rows, 'fecha_hora'),
    (r) => {
      const bVal = (r.heces && aplicaBristol(r.fecha_hora)) ? (r.bristol || bristolMap[String(r.id)] || null) : null;
      const bInfo = bVal ? BRISTOL_DATA.find((b) => b.tipo === Number(bVal)) : null;
      const bristolBadge = bInfo
        ? `<span class="bristol-badge" style="--bristol-color:${bInfo.color}" title="${escapeHtml(bInfo.estado)}">${bInfo.svg} Bristol ${bInfo.tipo}: ${escapeHtml(bInfo.corto)}</span>`
        : '';
      const tipos = [r.heces && `💩 Heces${bristolBadge}`, r.orina && '💧 Orina'].filter(Boolean).join(' · ') || '—';
      return `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${tipos}</td>${accionesTd('panales', r.id)}</tr>`;
    },
    (rs) => `💩 ${rs.filter((r) => r.heces).length} · 💧 ${rs.filter((r) => r.orina).length}`,
    (rs) => `💩 ${rs.filter((r) => r.heces).length} · 💧 ${rs.filter((r) => r.orina).length}`
  );
  actualizarVisibilidadBristolForm();
}

// ---------- Sueño ----------
function duracionMin(r) {
  if (!r.inicio) return 0;
  const ini = new Date(r.inicio);
  const fin = r.fin ? new Date(r.fin) : new Date();
  return Math.max(0, (fin - ini) / 60000);
}

function tramosPorDia(r) {
  if (!r.inicio) return [];
  const ini = new Date(r.inicio);
  const fin = r.fin ? new Date(r.fin) : new Date();
  if (fin <= ini) return [];
  const tramos = [];
  let cur = new Date(ini);
  while (cur < fin) {
    const dStr = dayKey(cur);
    const midNext = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0);
    const finTramo = fin < midNext ? fin : midNext;
    const mins = (finTramo - cur) / 60000;
    if (mins > 0) {
      tramos.push({
        key: dStr,
        mins,
        inicioTramo: new Date(cur),
        finTramo: new Date(finTramo),
        esInicio: cur.getTime() === ini.getTime(),
        esFin: r.fin ? finTramo.getTime() === fin.getTime() : false,
        esActiva: !r.fin && finTramo.getTime() === fin.getTime(),
        original: r,
      });
    }
    cur = finTramo;
  }
  return tramos;
}

function agruparSuenoPorDia(rows) {
  const grupos = new Map();
  for (const r of rows) {
    const tramos = tramosPorDia(r);
    for (const t of tramos) {
      if (!grupos.has(t.key)) grupos.set(t.key, []);
      grupos.get(t.key).push(t);
    }
  }
  return grupos;
}

let siestaTimer = null;
function pintarSiestaActiva(siesta) {
  clearInterval(siestaTimer);
  const abierta = $('siestaAbierta'), btnD = $('btnDormir');
  if (!siesta) {
    abierta.classList.add('hidden');
    btnD.classList.remove('hidden');
    return;
  }
  btnD.classList.add('hidden');
  abierta.classList.remove('hidden');
  const ini = new Date(siesta.inicio);
  $('siestaDesde').textContent = `${fmtTime(ini)} (${ini.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })})`;
  const tick = () => {
    const dur = fmtDur(Math.max(0, (Date.now() - ini) / 60000));
    $('siestaLleva').textContent = dur;
    if ($('despiertoHaceLabel') && $('despiertoHaceLabel').textContent.includes('Dormido')) {
      $('despiertoHace').textContent = dur;
    }
  };
  tick();
  siestaTimer = setInterval(tick, 30000);
}

function renderSueno() {
  const rows = cache.sueno || [];
  const siestaActiva = rows.find((r) => !r.fin);
  pintarSiestaActiva(siestaActiva);

  const cerradas = rows.filter((r) => r.fin);
  if (siestaActiva) {
    const ini = new Date(siestaActiva.inicio);
    $('despiertoHaceLabel').innerHTML = '<span class="live-dot"></span>Dormido hace';
    $('despiertoHace').textContent = fmtDur(Math.max(0, (Date.now() - ini) / 60000));
    $('despiertoHace').style.color = 'var(--brand-accent)';
  } else if (!cerradas.length) {
    $('despiertoHaceLabel').textContent = 'Despierto hace';
    $('despiertoHace').textContent = '—';
    $('despiertoHace').style.color = '';
  } else {
    const ultFin = new Date(cerradas[0].fin);
    $('despiertoHaceLabel').textContent = 'Despierto hace';
    $('despiertoHace').textContent = fmtDur(Math.max(0, (Date.now() - ultFin) / 60000));
    $('despiertoHace').style.color = '';
  }

  if (!cerradas.length) {
    $('ultimoSueno').textContent = siestaActiva ? 'En curso' : 'Sin registros';
  } else {
    const ult = cerradas[0];
    $('ultimoSueno').textContent = `${fmtTime(new Date(ult.inicio))} - ${fmtTime(new Date(ult.fin))} · ${fmtDur(duracionMin(ult))}`;
  }

  const gruposSueno = agruparSuenoPorDia(rows);

  $('tablaSueno').innerHTML = tablaHTML(
    ['Inicio', 'Fin', 'Duración'],
    gruposSueno,
    (t) => {
      const iniTxt = t.esInicio ? fmtTime(t.inicioTramo) : '00:00 🌅';
      let finTxt = '';
      if (t.esActiva) {
        finTxt = '<span style="color:var(--brand-accent); font-weight:700;"><span class="live-dot"></span>Durmiendo…</span>';
      } else if (!t.esFin) {
        finTxt = '24:00 🌙';
      } else {
        finTxt = fmtTime(t.finTramo);
      }
      const durTxt = fmtDur(t.mins);
      return `<tr><td>${iniTxt}</td><td>${finTxt}</td><td>${durTxt}</td>${accionesTd('sueno', t.original.id)}</tr>`;
    },
    (tramosDia) => fmtDur(tramosDia.reduce((s, t) => s + t.mins, 0)),
    (tramosMes) => fmtDur(tramosMes.reduce((s, t) => s + t.mins, 0))
  );
}

// Botones de siesta en vivo con bloqueo durante el guardado
$('btnDormir').addEventListener('click', async () => {
  if ($('btnDormir').disabled) return;
  $('btnDormir').disabled = true;
  try {
    const ok = await insertar('sueno', { inicio: new Date().toISOString(), fin: null });
    if (ok) renderSueno();
  } finally {
    $('btnDormir').disabled = false;
  }
});

$('btnDespertar').addEventListener('click', async () => {
  const siesta = (cache.sueno || []).find((r) => !r.fin);
  if (!siesta) return;
  if ($('btnDespertar').disabled) return;
  $('btnDespertar').disabled = true;
  try {
    const fin = new Date().toISOString();
    const { error } = await db.from('sueno').update({ fin }).eq('id', siesta.id);
    if (error) { toast(`Error: ${error.message}`, true); return; }
    await loadData('sueno');
    statsDirty = true;
    toast('Siesta registrada ✓');
    renderSueno();
    if (typeof window.enviarNotificacionWhatsApp === 'function') {
      window.enviarNotificacionWhatsApp('sueno_fin', { inicio: siesta.inicio, fin }, { bebe, miRol });
    }
    if (typeof actualizarAlertasYBadge === 'function') {
      actualizarAlertasYBadge();
    }
  } finally {
    $('btnDespertar').disabled = false;
  }
});

// ---------- Gráficos y Estadísticas (Chart.js + Zoom) ----------
const charts = {};

const SERIES = {
  dark:  { azul: '#3987e5', ambar: '#c98500', violeta: '#9085e9', verde: '#199e70' },
  light: { azul: '#2a78d6', ambar: '#eda100', violeta: '#4a3aa7', verde: '#12825b' },
};

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let statsRange = localStorage.getItem('stats_range') || '7d';

const chartTypes = {
  leche: localStorage.getItem('chart_type_leche') || 'bar',
  vitaminas: localStorage.getItem('chart_type_vitaminas') || 'bar',
  panales: localStorage.getItem('chart_type_panales') || 'bar',
  sueno: localStorage.getItem('chart_type_sueno') || 'bar',
};

function obtenerDiasRango(range) {
  const numDias = range === '1d' ? 1 : range === '14d' ? 14 : range === '30d' ? 30 : 7;
  const dias = [];
  for (let i = numDias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const mesCorto = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
    const label = numDias === 1
      ? 'Hoy'
      : numDias <= 7
        ? d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
        : `${d.getDate()} ${mesCorto}`;
    const fullDate = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    dias.push({ key: dayKey(d), label, fullDate });
  }
  return dias;
}

function sumarPorDia(rows, campoFecha, valorFn) {
  const tot = {};
  for (const r of rows || []) {
    const k = dayKey(new Date(r[campoFecha]));
    tot[k] = (tot[k] || 0) + valorFn(r);
  }
  return tot;
}

// Agregaciones horarias para modo 1 día (Hoy · 24 horas)
function sumarLechePorHoraHoy(rows) {
  const hoy = dayKey(new Date());
  const horas = new Array(24).fill(0);
  for (const r of rows || []) {
    const d = new Date(r.fecha_hora);
    if (dayKey(d) === hoy) {
      const h = d.getHours();
      horas[h] += r.cantidad_ml;
    }
  }
  return horas;
}

function sumarVitaminasPorHoraHoy(rows) {
  const hoy = dayKey(new Date());
  const horas = new Array(24).fill(0);
  // 1. Dosis sueltas (tabla vitaminas)
  for (const r of rows || []) {
    if (!r.fecha_hora) continue;
    const d = new Date(r.fecha_hora);
    if (dayKey(d) === hoy) {
      const h = d.getHours();
      horas[h] += (Number(r.gotas) || 0);
    }
  }
  // 2. Checklist de vitaminas con nombre (tabla vitaminas_tipos_log)
  const mapa = new Map((cache.vitaminas_tipos || []).map((v) => [String(v.id), v]));
  for (const l of cache.vitaminas_tipos_log || []) {
    if (l.fecha === hoy) {
      let h = 12; // Valor centrado si no tiene hora
      if (l.hora) {
        const parts = l.hora.split(':');
        const parsedH = parseInt(parts[0], 10);
        if (!isNaN(parsedH) && parsedH >= 0 && parsedH <= 23) h = parsedH;
      }
      const v = mapa.get(String(l.vitamina_id));
      const gotas = Number(l.gotas) || v?.gotas_default || 5;
      horas[h] += gotas;
    }
  }
  return horas;
}

function sumarPanalesPorHoraHoy(rows) {
  const hoy = dayKey(new Date());
  const orina = new Array(24).fill(0);
  const heces = new Array(24).fill(0);
  for (const r of rows || []) {
    const d = new Date(r.fecha_hora);
    if (dayKey(d) === hoy) {
      const h = d.getHours();
      if (r.orina) orina[h] += 1;
      if (r.heces) heces[h] += 1;
    }
  }
  return { orina, heces };
}

function calcularSuenoPorHoraHoy(rows) {
  const hoy = dayKey(new Date());
  const minsPorHora = new Array(24).fill(0);
  for (const r of rows || []) {
    if (!r.inicio) continue;
    const ini = new Date(r.inicio);
    const fin = r.fin ? new Date(r.fin) : new Date();
    if (fin <= ini) continue;

    for (let h = 0; h < 24; h++) {
      const slotIni = new Date(`${hoy}T${pad2(h)}:00:00`).getTime();
      const slotFin = slotIni + 3600000;
      const iniOverlap = Math.max(ini.getTime(), slotIni);
      const finOverlap = Math.min(fin.getTime(), slotFin);
      if (finOverlap > iniOverlap) {
        minsPorHora[h] += (finOverlap - iniOverlap) / 60000;
      }
    }
  }
  return minsPorHora.map((m) => Math.round((m / 60) * 10) / 10);
}

const BAR = { maxBarThickness: 32, borderRadius: 5, categoryPercentage: 0.72, barPercentage: 0.9 };
const LINEA = { tension: 0.32, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, fill: false };

function baseChartOpts(extraTooltip = {}, esHorario = false) {
  const muted = cssVar('--muted'), grid = cssVar('--grid');
  
  let maxTicks = undefined;
  if (esHorario) maxTicks = 8;
  else if (statsRange === '30d') maxTicks = 6;
  else if (statsRange === '14d') maxTicks = 7;

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar('--surface-2'),
        titleColor: cssVar('--text'),
        bodyColor: cssVar('--text-2'),
        borderColor: grid,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        ...extraTooltip,
      },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
        pan: { enabled: true, mode: 'x' },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: muted,
          font: { size: 11 },
          autoSkip: true,
          maxTicksLimit: maxTicks,
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: grid },
        border: { display: false },
        ticks: { color: muted, font: { size: 11 }, precision: 0 },
      },
    },
  };
}

function actualizarStatsUI() {
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === statsRange));
  
  // Actualizar toggles de tipo de gráfico
  for (const [key, type] of Object.entries(chartTypes)) {
    document.querySelectorAll(`.chart-type-toggle[data-chart="${key}"] .type-btn`).forEach((b) => {
      b.classList.toggle('active', b.dataset.type === type);
    });
  }

  const rangeLabels = {
    '1d': 'hoy por horas',
    '7d': 'últimos 7 días',
    '14d': 'últimos 14 días',
    '30d': 'últimos 30 días',
  };
  const suf = rangeLabels[statsRange] || 'últimos 7 días';
  $('tituloLeche').textContent = `🍼 Leche · ${suf} (ml)`;
  $('tituloVitaminas').textContent = `💊 Vitaminas · ${suf} (gotas)`;
  $('tituloPanales').textContent = `🧷 Pañales · ${suf}`;
  $('tituloSueno').textContent = `😴 Sueño · ${suf} (horas)`;
}

// Selector de rango
document.querySelectorAll('.seg-btn').forEach((b) =>
  b.addEventListener('click', () => {
    statsRange = b.dataset.range;
    localStorage.setItem('stats_range', statsRange);
    renderCharts();
  })
);

// Selector de tipo de gráfico por métrica
document.querySelectorAll('.chart-type-toggle .type-btn').forEach((b) =>
  b.addEventListener('click', (e) => {
    const parent = e.target.closest('.chart-type-toggle');
    const chartKey = parent.dataset.chart;
    const type = b.dataset.type;
    chartTypes[chartKey] = type;
    localStorage.setItem(`chart_type_${chartKey}`, type);
    renderCharts();
  })
);

// Reset de zoom
document.querySelectorAll('.zoom-reset').forEach((b) =>
  b.addEventListener('click', () => charts[b.dataset.key]?.resetZoom())
);

function renderCharts() {
  Object.values(charts).forEach((c) => c.destroy());
  actualizarStatsUI();

  const s = {
    azul: cssVar('--brand-primary') || '#3987e5',
    ambar: cssVar('--brand-accent') || '#fbbf24',
    violeta: cssVar('--brand-secondary') || '#7c3aed',
    verde: cssVar('--brand-accent') || '#10b981',
  };
  const surface = cssVar('--surface');

  if (statsRange === '1d') {
    renderChartsHorario(s, surface);
  } else {
    renderChartsDias(s, surface);
  }

  statsDirty = false;
}

function renderChartsHorario(s, surface) {
  const horasLabels = Array.from({ length: 24 }, (_, i) => `${pad2(i)}:00`);

  // 1. Leche por hora hoy
  const lecheHoras = sumarLechePorHoraHoy(cache.tomas);
  const typeLeche = chartTypes.leche || 'bar';
  charts.leche = new Chart($('chartLeche'), {
    type: typeLeche,
    data: {
      labels: horasLabels,
      datasets: [{
        label: 'Leche (ml)',
        data: lecheHoras,
        backgroundColor: s.azul,
        borderColor: s.azul,
        ...(typeLeche === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => `Hoy a las ${items[0].label} h`,
        label: (c) => ` ${c.parsed.y} ml`,
      },
    }, true),
  });

  // 2. Vitaminas por hora hoy
  const vitHoras = sumarVitaminasPorHoraHoy(cache.vitaminas);
  const typeVit = chartTypes.vitaminas || 'bar';
  charts.vitaminas = new Chart($('chartVitaminas'), {
    type: typeVit,
    data: {
      labels: horasLabels,
      datasets: [{
        label: 'Vitaminas (gotas)',
        data: vitHoras,
        backgroundColor: s.ambar,
        borderColor: s.ambar,
        ...(typeVit === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => `Hoy a las ${items[0].label} h`,
        label: (c) => ` ${c.parsed.y} gotas`,
      },
    }, true),
  });

  // 3. Pañales por hora hoy
  const panHoras = sumarPanalesPorHoraHoy(cache.panales);
  const typePan = chartTypes.panales || 'bar';
  const optsPan = baseChartOpts({
    callbacks: {
      title: (items) => `Hoy a las ${items[0].label} h`,
    },
  }, true);
  optsPan.plugins.legend = {
    display: true,
    position: 'top',
    labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, color: cssVar('--text-2'), font: { size: 11 } },
  };

  if (typePan === 'bar') {
    optsPan.scales.x.stacked = true;
    optsPan.scales.y.stacked = true;
    charts.panales = new Chart($('chartPanales'), {
      type: 'bar',
      data: {
        labels: horasLabels,
        datasets: [
          { label: 'Orina', data: panHoras.orina, backgroundColor: s.azul, borderColor: surface, borderWidth: 2, ...BAR, borderRadius: 3 },
          { label: 'Heces', data: panHoras.heces, backgroundColor: s.ambar, borderColor: surface, borderWidth: 2, ...BAR, borderRadius: 3 },
        ],
      },
      options: optsPan,
    });
  } else {
    charts.panales = new Chart($('chartPanales'), {
      type: 'line',
      data: {
        labels: horasLabels,
        datasets: [
          { label: 'Orina', data: panHoras.orina, borderColor: s.azul, backgroundColor: s.azul, ...LINEA },
          { label: 'Heces', data: panHoras.heces, borderColor: s.ambar, backgroundColor: s.ambar, ...LINEA },
        ],
      },
      options: optsPan,
    });
  }

  // 4. Sueño por hora hoy
  const suenoHoras = calcularSuenoPorHoraHoy(cache.sueno);
  const typeSueno = chartTypes.sueno || 'bar';
  charts.sueno = new Chart($('chartSueno'), {
    type: typeSueno,
    data: {
      labels: horasLabels,
      datasets: [{
        label: 'Sueño (horas)',
        data: suenoHoras,
        backgroundColor: s.violeta,
        borderColor: s.violeta,
        ...(typeSueno === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => `Hoy a las ${items[0].label} h`,
        label: (c) => ` ${fmtDur(c.parsed.y * 60)} dormidas`,
      },
    }, true),
  });
}

function renderChartsDias(s, surface) {
  const dias = obtenerDiasRango(statsRange);
  const labels = dias.map((d) => d.label);

  // 1. Leche
  const leche = sumarPorDia(cache.tomas, 'fecha_hora', (r) => r.cantidad_ml);
  const typeLeche = chartTypes.leche || 'bar';
  charts.leche = new Chart($('chartLeche'), {
    type: typeLeche,
    data: {
      labels,
      datasets: [{
        label: 'Leche (ml)',
        data: dias.map((d) => leche[d.key] || 0),
        backgroundColor: s.azul,
        borderColor: s.azul,
        ...(typeLeche === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => dias[items[0].dataIndex]?.fullDate || items[0].label,
        label: (c) => ` ${c.parsed.y} ml`,
      },
    }),
  });

  // 2. Vitaminas (dosis sueltas + checklist por nombre)
  const vit = sumarPorDia(cache.vitaminas, 'fecha_hora', (r) => r.gotas);
  const mapaTipos = new Map((cache.vitaminas_tipos || []).map((v) => [String(v.id), v]));
  (cache.vitaminas_tipos_log || []).forEach((l) => {
    if (l.fecha) {
      const v = mapaTipos.get(String(l.vitamina_id));
      const g = Number(l.gotas) || v?.gotas_default || 5;
      vit[l.fecha] = (vit[l.fecha] || 0) + g;
    }
  });
  const typeVit = chartTypes.vitaminas || 'bar';
  charts.vitaminas = new Chart($('chartVitaminas'), {
    type: typeVit,
    data: {
      labels,
      datasets: [{
        label: 'Vitaminas (gotas)',
        data: dias.map((d) => vit[d.key] || 0),
        backgroundColor: s.ambar,
        borderColor: s.ambar,
        ...(typeVit === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => dias[items[0].dataIndex]?.fullDate || items[0].label,
        label: (c) => ` ${c.parsed.y} gotas`,
      },
    }),
  });

  // 3. Pañales
  const heces = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.heces ? 1 : 0));
  const orina = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.orina ? 1 : 0));
  const typePan = chartTypes.panales || 'bar';
  const optsPan = baseChartOpts({
    callbacks: {
      title: (items) => dias[items[0].dataIndex]?.fullDate || items[0].label,
    },
  });
  optsPan.plugins.legend = {
    display: true,
    position: 'top',
    labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, color: cssVar('--text-2'), font: { size: 11 } },
  };

  if (typePan === 'bar') {
    optsPan.scales.x.stacked = true;
    optsPan.scales.y.stacked = true;
    charts.panales = new Chart($('chartPanales'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Orina', data: dias.map((d) => orina[d.key] || 0), backgroundColor: s.azul, borderColor: surface, borderWidth: 2, ...BAR, borderRadius: 3 },
          { label: 'Heces', data: dias.map((d) => heces[d.key] || 0), backgroundColor: s.ambar, borderColor: surface, borderWidth: 2, ...BAR, borderRadius: 3 },
        ],
      },
      options: optsPan,
    });
  } else {
    charts.panales = new Chart($('chartPanales'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Orina', data: dias.map((d) => orina[d.key] || 0), borderColor: s.azul, backgroundColor: s.azul, ...LINEA },
          { label: 'Heces', data: dias.map((d) => heces[d.key] || 0), borderColor: s.ambar, backgroundColor: s.ambar, ...LINEA },
        ],
      },
      options: optsPan,
    });
  }

  // 4. Sueño
  const sueno = {};
  (cache.sueno || []).forEach((r) => tramosPorDia(r).forEach((t) => { sueno[t.key] = (sueno[t.key] || 0) + t.mins; }));
  const typeSueno = chartTypes.sueno || 'bar';
  charts.sueno = new Chart($('chartSueno'), {
    type: typeSueno,
    data: {
      labels,
      datasets: [{
        label: 'Sueño (horas)',
        data: dias.map((d) => Math.round(((sueno[d.key] || 0) / 60) * 10) / 10),
        backgroundColor: s.violeta,
        borderColor: s.violeta,
        ...(typeSueno === 'bar' ? BAR : LINEA),
      }],
    },
    options: baseChartOpts({
      callbacks: {
        title: (items) => dias[items[0].dataIndex]?.fullDate || items[0].label,
        label: (c) => ` ${fmtDur(c.parsed.y * 60)}`,
      },
    }),
  });
}

// ---------- Tabs ----------
const TABS = {
  stats: { icon: '📊', label: 'Stats' },
  alertas: { icon: '🚨', label: 'Alertas' },
  leche: { icon: '🍼', label: 'Leche' },
  comidas: { icon: '🍽️', label: 'Comidas' },
  vitaminas: { icon: '💊', label: 'Vitaminas' },
  panales: { icon: '🧷', label: 'Pañales' },
  sueno: { icon: '😴', label: 'Sueño' },
  info: { icon: '👶', label: 'Info' },
  bitacora: { icon: '📖', label: 'Bitácora' },
  juegos: { icon: '🧸', label: 'Juegos' },
};

const ORDEN_DEFAULT = ['stats', 'alertas', 'leche', 'comidas', 'vitaminas', 'panales', 'sueno', 'info', 'bitacora', 'juegos'];

function leerOrdenTabs() {
  try {
    const guardado = JSON.parse(localStorage.getItem('orden_tabs') || 'null');
    if (Array.isArray(guardado)) {
      const validos = guardado.filter((k) => TABS[k]);
      const faltantes = ORDEN_DEFAULT.filter((k) => !validos.includes(k));
      return [...validos, ...faltantes];
    }
  } catch {}
  return ORDEN_DEFAULT.slice();
}

function renderTabbar() {
  const orden = leerOrdenTabs();
  const barra = orden.slice(0, 4);
  const mas = orden.slice(4);

  let html = barra
    .map((k) => {
      const isAlerta = k === 'alertas' && window.conteoAlertasActivas > 0;
      const badge = isAlerta ? `<span class="tab-badge" style="position:absolute; top:2px; right:6px; background:#ef4444; color:#fff; border-radius:10px; font-size:0.65rem; padding:1px 5px; font-weight:800; line-height:1.2;">${window.conteoAlertasActivas}</span>` : '';
      return `<button class="tab-btn${k === currentTab ? ' active' : ''}" data-tab="${k}" style="position:relative;"><span>${TABS[k].icon}</span>${TABS[k].label}${badge}</button>`;
    })
    .join('');

  if (mas.length) {
    const enMas = mas.includes(currentTab);
    const iconoActivo = enMas ? TABS[currentTab].icon : '⋯';
    const labelActivo = enMas ? TABS[currentTab].label : 'Más';
    const hayAlertasEnMas = mas.includes('alertas') && window.conteoAlertasActivas > 0;
    const badgeMas = hayAlertasEnMas ? `<span class="tab-badge" style="position:absolute; top:2px; right:6px; background:#ef4444; color:#fff; border-radius:10px; font-size:0.65rem; padding:1px 5px; font-weight:800; line-height:1.2;">!</span>` : '';
    html += `<button class="tab-btn${enMas ? ' active' : ''}" id="tabMasBtn" aria-haspopup="true" style="position:relative;"><span>${iconoActivo}</span>${labelActivo}${badgeMas}</button>`;
    html += `<div class="tab-menu hidden" id="tabMenu">${mas
      .map((k) => {
        const isAlerta = k === 'alertas' && window.conteoAlertasActivas > 0;
        const badge = isAlerta ? `<span class="tab-badge" style="margin-left:auto; background:#ef4444; color:#fff; border-radius:10px; font-size:0.65rem; padding:1px 5px; font-weight:800;">${window.conteoAlertasActivas}</span>` : '';
        return `<button class="tab-btn tab-menu-item${k === currentTab ? ' active' : ''}" data-tab="${k}" style="display:flex; align-items:center; gap:6px;"><span>${TABS[k].icon}</span>${TABS[k].label}${badge}</button>`;
      })
      .join('')}</div>`;
  }
  $('tabbar').innerHTML = html;
}

// ---------- Módulo de Comidas: Plato Dinámico Semanal, Catálogo con Imágenes e Historial + Alergias ----------
const SYSTEM_COMIDA_PLATO = '__comida_plato__';
const SYSTEM_COMIDA_CUSTOM = '__comida_custom__';

const GRUPOS_COMIDA = [
  {
    key: 'verdura',
    nombre: 'Verdura',
    icono: '🥦',
    color: '#2d6a4f',
    nutrientes: 'Vitamina C (tomate, brócoli, pimentón, limón), Vitamina A (espinaca, acelga, pimentón, zapallo, zanahoria), Hierro (espinaca, acelga, kale)',
    tip: 'Frutas y verduras se pueden introducir en pequeñas cantidades en todas las comidas. La vitamina C duplica la absorción de hierro.',
  },
  {
    key: 'fruta',
    nombre: 'Fruta',
    icono: '🍌',
    color: '#f4a261',
    nutrientes: 'Fibra, agua y Vitamina C',
    tip: 'Combinar frutas ricas en vitamina C con fuentes de hierro para mejorar su absorción.',
  },
  {
    key: 'proteina',
    nombre: 'Proteína',
    icono: '🫘',
    color: '#4a7c59',
    nutrientes: 'Proteínas, Hierro, Zinc',
    tip: 'Ofrecer diariamente, siempre en almuerzo y cena.',
  },
  {
    key: 'grasa',
    nombre: 'Grasa saludable',
    icono: '🥑',
    color: '#588157',
    nutrientes: 'Calorías y grasas ricas en Omega 3 (chía, linaza, canola, nueces, cáñamo y pescados grasos como jurel)',
    tip: 'Todas las comidas deben contener fuentes de grasas saludables.',
  },
  {
    key: 'cereal',
    nombre: 'Cereal / Tubérculo',
    icono: '🍚',
    color: '#9c7a44',
    nutrientes: 'Energía (carbohidratos complejos)',
    tip: 'Es clave en el aporte de calorías diariamente; se integran en todos los tiempos de comidas.',
  },
];

function normalizarItemAlimento(item) {
  const base = String(item.nombreBase || item.nombre || '')
    .replace(/[\s🌾🦷🌿❗]+$/gu, '')
    .trim();
  const iconos = [
    item.fibra ? '🌾' : '',
    item.calcio ? '🦷' : '',
    item.hierro ? '🌿' : '',
    item.alergeno ? '❗' : '',
  ].filter(Boolean).join('');
  return {
    ...item,
    nombreBase: base,
    nombre: iconos ? `${base} ${iconos}` : base,
  };
}

const CATALOGO_ALIMENTOS_RAW = [
  // 1. Verduras (26 alimentos según tabla maestra)
  { id: 'acelga', nombre: 'Acelga', grupo: 'verdura', forma: 'hoja', c1: '#166534', c2: '#e2e8f0', calcio: true, hierro: true },
  { id: 'albahaca_verdura', nombre: 'Albahaca', grupo: 'verdura', forma: 'hierba', c1: '#16a34a', c2: '#86efac', calcio: true, hierro: true },
  { id: 'alcachofa', nombre: 'Alcachofa', grupo: 'verdura', forma: 'alcachofa', c1: '#4d7c0f', c2: '#a3e635', fibra: true, hierro: true },
  { id: 'apio', nombre: 'Apio', grupo: 'verdura', forma: 'esparrago', c1: '#65a30d', c2: '#bef264', fibra: true },
  { id: 'berenjena', nombre: 'Berenjena', grupo: 'verdura', forma: 'berenjena', c1: '#581c87', c2: '#22c55e' },
  { id: 'beterraga', nombre: 'Beterraga', grupo: 'verdura', forma: 'bulbo', c1: '#881337', c2: '#be185d', fibra: true },
  { id: 'brocoli', nombre: 'Brócoli', grupo: 'verdura', forma: 'brocoli', c1: '#2e8b57', c2: '#74c69d', fibra: true, calcio: true, hierro: true },
  { id: 'bruselas', nombre: 'Bruselas', grupo: 'verdura', forma: 'bolitas', c1: '#4d7c0f', c2: '#bef264', fibra: true, hierro: true },
  { id: 'cebolla', nombre: 'Cebolla', grupo: 'verdura', forma: 'bulbo', c1: '#d97706', c2: '#fef3c7' },
  { id: 'champinon', nombre: 'Champiñón', grupo: 'verdura', forma: 'hongo', c1: '#d6d3d1', c2: '#78716c' },
  { id: 'cilantro_verdura', nombre: 'Cilantro', grupo: 'verdura', forma: 'hierba', c1: '#15803d', c2: '#4ade80', hierro: true },
  { id: 'coliflor', nombre: 'Coliflor', grupo: 'verdura', forma: 'brocoli', c1: '#e2e8f0', c2: '#4ade80', fibra: true },
  { id: 'esparrago', nombre: 'Espárrago', grupo: 'verdura', forma: 'esparrago', c1: '#15803d', c2: '#86efac', fibra: true, hierro: true },
  { id: 'espinaca', nombre: 'Espinaca', grupo: 'verdura', forma: 'hoja', c1: '#15803d', c2: '#4ade80', calcio: true, hierro: true },
  { id: 'kale', nombre: 'Kale', grupo: 'verdura', forma: 'hoja', c1: '#14532d', c2: '#86efac', calcio: true, hierro: true },
  { id: 'lechuga', nombre: 'Lechuga', grupo: 'verdura', forma: 'alcachofa', c1: '#4ade80', c2: '#bbf7d0' },
  { id: 'pepino', nombre: 'Pepino', grupo: 'verdura', forma: 'calabacin', c1: '#15803d', c2: '#bbf7d0' },
  { id: 'perejil_verdura', nombre: 'Perejil', grupo: 'verdura', forma: 'hierba', c1: '#166534', c2: '#86efac', hierro: true },
  { id: 'pimenton', nombre: 'Pimentón', grupo: 'verdura', forma: 'pimenton', c1: '#dc2626', c2: '#22c55e' },
  { id: 'porotos_verdes', nombre: 'Poroto Verde', grupo: 'verdura', forma: 'vainas', c1: '#22c55e', c2: '#15803d', fibra: true, hierro: true },
  { id: 'puerro', nombre: 'Puerro', grupo: 'verdura', forma: 'esparrago', c1: '#4d7c0f', c2: '#f1f5f9', fibra: true, calcio: true },
  { id: 'rabanos', nombre: 'Rábanos', grupo: 'verdura', forma: 'bulbo', c1: '#e11d48', c2: '#fecdd3' },
  { id: 'repollo', nombre: 'Repollo', grupo: 'verdura', forma: 'alcachofa', c1: '#65a30d', c2: '#d9f99d', fibra: true },
  { id: 'tomate', nombre: 'Tomate', grupo: 'verdura', forma: 'tomate', c1: '#ef4444', c2: '#22c55e' },
  { id: 'zanahoria', nombre: 'Zanahoria', grupo: 'verdura', forma: 'zanahoria', c1: '#f97316', c2: '#22c55e' },
  { id: 'zapallo', nombre: 'Zapallo Camote', grupo: 'verdura', forma: 'zapallo', c1: '#ea580c', c2: '#fb923c' },
  { id: 'zapallo_italiano', nombre: 'Zapallo Italiano', grupo: 'verdura', forma: 'calabacin', c1: '#16a34a', c2: '#bbf7d0' },

  // 2. Frutas (35 alimentos según tabla maestra y tabla de fibra/calcio)
  { id: 'arandanos', nombre: 'Arándanos', grupo: 'fruta', forma: 'berries', c1: '#3730a3', c2: '#6366f1' },
  { id: 'cereza', nombre: 'Cereza', grupo: 'fruta', forma: 'cereza', c1: '#be123c', c2: '#22c55e' },
  { id: 'chirimoya', nombre: 'Chirimoya', grupo: 'fruta', forma: 'alcachofa', c1: '#4d7c0f', c2: '#fef9c3' },
  { id: 'ciruela', nombre: 'Ciruela', grupo: 'fruta', forma: 'fruta_redonda', c1: '#6b21a8', c2: '#a855f7', fibra: true },
  { id: 'ciruela_hidratada', nombre: 'Ciruela hidratada', grupo: 'fruta', forma: 'fruta_redonda', c1: '#4c1d95', c2: '#7e22ce', fibra: true },
  { id: 'damasco', nombre: 'Damasco', grupo: 'fruta', forma: 'fruta_redonda', c1: '#f59e0b', c2: '#fde68a' },
  { id: 'datiles', nombre: 'Dátiles', grupo: 'fruta', forma: 'semillas', c1: '#78350f', c2: '#b45309', fibra: true, calcio: true },
  { id: 'durazno', nombre: 'Durazno Conservero', grupo: 'fruta', forma: 'fruta_redonda', c1: '#f97316', c2: '#fde047' },
  { id: 'durazno_peludo', nombre: 'Durazno Peludo', grupo: 'fruta', forma: 'fruta_redonda', c1: '#fb7185', c2: '#fdba74' },
  { id: 'durazno_platano', nombre: 'Durazno Plátano', grupo: 'fruta', forma: 'fruta_redonda', c1: '#facc15', c2: '#fb7185' },
  { id: 'frambuesas', nombre: 'Frambuesas', grupo: 'fruta', forma: 'berries', c1: '#e11d48', c2: '#fb7185', fibra: true },
  { id: 'frutilla', nombre: 'Frutilla', grupo: 'fruta', forma: 'frutilla', c1: '#e11d48', c2: '#22c55e' },
  { id: 'guinda', nombre: 'Guinda', grupo: 'fruta', forma: 'cereza', c1: '#881337', c2: '#16a34a' },
  { id: 'higo', nombre: 'Higo', grupo: 'fruta', forma: 'pera', c1: '#581c87', c2: '#f43f5e', fibra: true, calcio: true },
  { id: 'kiwi', nombre: 'Kiwi', grupo: 'fruta', forma: 'kiwi', c1: '#65a30d', c2: '#a16207', fibra: true },
  { id: 'mandarina', nombre: 'Mandarina', grupo: 'fruta', forma: 'citrico', c1: '#fb923c', c2: '#ffedd5' },
  { id: 'mango', nombre: 'Mango', grupo: 'fruta', forma: 'pera', c1: '#f59e0b', c2: '#ef4444' },
  { id: 'manzana', nombre: 'Manzana Roja', grupo: 'fruta', forma: 'manzana', c1: '#ef4444', c2: '#fef3c7', fibra: true },
  { id: 'manzana_verde', nombre: 'Manzana Verde', grupo: 'fruta', forma: 'manzana', c1: '#65a30d', c2: '#ecfccb', fibra: true },
  { id: 'manzana_cascara', nombre: 'Manzana con cáscara', grupo: 'fruta', forma: 'manzana', c1: '#dc2626', c2: '#86efac', fibra: true },
  { id: 'melon_calameno', nombre: 'Melón Calameño', grupo: 'fruta', forma: 'sandia', c1: '#fb923c', c2: '#4d7c0f' },
  { id: 'melon_tuna', nombre: 'Melón Tuna', grupo: 'fruta', forma: 'sandia', c1: '#bef264', c2: '#15803d' },
  { id: 'membrillo', nombre: 'Membrillo', grupo: 'fruta', forma: 'pera', c1: '#eab308', c2: '#fef08a', fibra: true },
  { id: 'moras', nombre: 'Moras', grupo: 'fruta', forma: 'berries', c1: '#312e81', c2: '#4c1d95', fibra: true },
  { id: 'naranja', nombre: 'Naranja', grupo: 'fruta', forma: 'citrico', c1: '#f97316', c2: '#fed7aa', fibra: true, calcio: true },
  { id: 'papaya', nombre: 'Papaya', grupo: 'fruta', forma: 'sandia', c1: '#f97316', c2: '#facc15' },
  { id: 'pepino_dulce', nombre: 'Pepino Dulce', grupo: 'fruta', forma: 'pera', c1: '#fde047', c2: '#9333ea' },
  { id: 'pera', nombre: 'Pera', grupo: 'fruta', forma: 'pera', c1: '#a3e635', c2: '#65a30d', fibra: true },
  { id: 'pera_piel', nombre: 'Pera con piel', grupo: 'fruta', forma: 'pera', c1: '#65a30d', c2: '#bef264', fibra: true },
  { id: 'pina', nombre: 'Piña', grupo: 'fruta', forma: 'pina', c1: '#eab308', c2: '#16a34a' },
  { id: 'platano', nombre: 'Plátano', grupo: 'fruta', forma: 'platano', c1: '#facc15', c2: '#fef08a' },
  { id: 'sandia', nombre: 'Sandía', grupo: 'fruta', forma: 'sandia', c1: '#ef4444', c2: '#16a34a' },
  { id: 'tuna', nombre: 'Tuna', grupo: 'fruta', forma: 'pina', c1: '#84cc16', c2: '#f97316', fibra: true },
  { id: 'uvas', nombre: 'Uva', grupo: 'fruta', forma: 'uvas', c1: '#7e22ce', c2: '#22c55e' },
  { id: 'limon', nombre: 'Limón (gotas)', grupo: 'fruta', forma: 'citrico', c1: '#eab308', c2: '#fef9c3' },

  // 3. Proteínas (18 alimentos: incluye Huevo Duro y todas las legumbres/proteínas de la tabla)
  { id: 'arvejas_amarillas', nombre: 'Arvejas Amarillas', grupo: 'proteina', forma: 'legumbres', c1: '#eab308', c2: '#fef08a', fibra: true, hierro: true },
  { id: 'arvejas_verdes', nombre: 'Arvejas Verdes', grupo: 'proteina', forma: 'bolitas', c1: '#16a34a', c2: '#86efac', fibra: true, hierro: true },
  { id: 'soya', nombre: 'Carne de Soya', grupo: 'proteina', forma: 'granos', c1: '#b45309', c2: '#fcd34d', fibra: true, calcio: true, hierro: true, alergeno: true },
  { id: 'garbanzos', nombre: 'Garbanzos', grupo: 'proteina', forma: 'legumbres', c1: '#d97706', c2: '#fde68a', fibra: true, calcio: true, hierro: true },
  { id: 'huevo', nombre: 'Huevo Duro', grupo: 'proteina', forma: 'huevo', c1: '#fef3c7', c2: '#f59e0b', hierro: true, alergeno: true },
  { id: 'lentejas', nombre: 'Lentejas Café', grupo: 'proteina', forma: 'legumbres', c1: '#92400e', c2: '#d97706', fibra: true, hierro: true },
  { id: 'lentejas_negras', nombre: 'Lentejas Negras', grupo: 'proteina', forma: 'legumbres', c1: '#1e293b', c2: '#64748b', fibra: true, hierro: true },
  { id: 'lentejas_rojas', nombre: 'Lentejas Rojas', grupo: 'proteina', forma: 'legumbres', c1: '#ea580c', c2: '#fdba74', fibra: true, hierro: true },
  { id: 'porotos', nombre: 'Porotos Allados', grupo: 'proteina', forma: 'frijol', c1: '#b45309', c2: '#fde68a', fibra: true, hierro: true },
  { id: 'porotos_blancos', nombre: 'Porotos Blancos', grupo: 'proteina', forma: 'frijol', c1: '#f1f5f9', c2: '#cbd5e1', fibra: true, calcio: true, hierro: true },
  { id: 'porotos_negros', nombre: 'Porotos Negros', grupo: 'proteina', forma: 'frijol', c1: '#1e293b', c2: '#475569', fibra: true, calcio: true, hierro: true },
  { id: 'porotos_rojos', nombre: 'Porotos Rojos', grupo: 'proteina', forma: 'frijol', c1: '#991b1b', c2: '#ef4444', fibra: true, hierro: true },
  { id: 'seitan', nombre: 'Seitán', grupo: 'proteina', forma: 'filete', c1: '#9a3412', c2: '#c2410c', hierro: true, alergeno: true },
  { id: 'tofu', nombre: 'Tofu', grupo: 'proteina', forma: 'cubos', c1: '#f8fafc', c2: '#cbd5e1', calcio: true, hierro: true, alergeno: true },
  { id: 'pollo', nombre: 'Pollo', grupo: 'proteina', forma: 'ave', c1: '#fdba74', c2: '#fed7aa', hierro: true },
  { id: 'carne', nombre: 'Vacuno / Carne', grupo: 'proteina', forma: 'filete', c1: '#b91c1c', c2: '#fca5a5', hierro: true },
  { id: 'pescado', nombre: 'Pescado / Jurel', grupo: 'proteina', forma: 'pez', c1: '#fb7185', c2: '#cbd5e1', hierro: true, alergeno: true },
  { id: 'mariscos', nombre: 'Mariscos cocidos', grupo: 'proteina', forma: 'marisco', c1: '#f97316', c2: '#fed7aa', hierro: true, alergeno: true },

  // 4. Grasas saludables (24 alimentos según tabla maestra y tabla de fibra/calcio/alérgenos)
  { id: 'aceite_canola', nombre: 'Aceite de Canola', grupo: 'grasa', forma: 'botella', c1: '#eab308', c2: '#fef9c3' },
  { id: 'aceite_chia', nombre: 'Aceite de Chía', grupo: 'grasa', forma: 'botella', c1: '#ca8a04', c2: '#fef08a' },
  { id: 'aceite_linaza', nombre: 'Aceite de Linaza', grupo: 'grasa', forma: 'botella', c1: '#d97706', c2: '#fde68a' },
  { id: 'almendra', nombre: 'Almendra', grupo: 'grasa', forma: 'nuez', c1: '#92400e', c2: '#fed7aa', fibra: true, calcio: true, hierro: true, alergeno: true },
  { id: 'aceite_oliva', nombre: 'AOEV', grupo: 'grasa', forma: 'botella', c1: '#84cc16', c2: '#ecfccb' },
  { id: 'avellana', nombre: 'Avellana', grupo: 'grasa', forma: 'nuez', c1: '#78350f', c2: '#d97706', calcio: true, hierro: true, alergeno: true },
  { id: 'avellana_europea', nombre: 'Avellana Europea', grupo: 'grasa', forma: 'nuez', c1: '#854d0e', c2: '#fde047', calcio: true, hierro: true, alergeno: true },
  { id: 'castana_caju', nombre: 'Castaña de Cajú', grupo: 'grasa', forma: 'nuez', c1: '#d97706', c2: '#fef3c7', hierro: true, alergeno: true },
  { id: 'chia', nombre: 'Chía', grupo: 'grasa', forma: 'semillas', c1: '#475569', c2: '#94a3b8', fibra: true, calcio: true, hierro: true },
  { id: 'chia_hidratada', nombre: 'Chía hidratada', grupo: 'grasa', forma: 'semillas', c1: '#334155', c2: '#cbd5e1', fibra: true, calcio: true, hierro: true },
  { id: 'linaza', nombre: 'Linaza', grupo: 'grasa', forma: 'semillas', c1: '#92400e', c2: '#d97706', fibra: true, hierro: true },
  { id: 'mant_almendra', nombre: 'Mant. de Almendra', grupo: 'grasa', forma: 'frasco', c1: '#92400e', c2: '#fed7aa', calcio: true, hierro: true, alergeno: true },
  { id: 'mant_mani', nombre: 'Mant. de Maní', grupo: 'grasa', forma: 'frasco', c1: '#b45309', c2: '#fde68a', hierro: true, alergeno: true },
  { id: 'nuez', nombre: 'Nuez', grupo: 'grasa', forma: 'nuez', c1: '#78350f', c2: '#b45309', calcio: true, hierro: true, alergeno: true },
  { id: 'palta', nombre: 'Palta', grupo: 'grasa', forma: 'palta', c1: '#65a30d', c2: '#78350f' },
  { id: 'pepitas_zapallo', nombre: 'Pepitas de Zapallo', grupo: 'grasa', forma: 'semillas', c1: '#4d7c0f', c2: '#bef264', hierro: true },
  { id: 'pesto', nombre: 'Pesto de albahaca', grupo: 'grasa', forma: 'frasco', c1: '#15803d', c2: '#86efac', calcio: true, hierro: true },
  { id: 'pistacho', nombre: 'Pistacho', grupo: 'grasa', forma: 'nuez', c1: '#65a30d', c2: '#fde68a', calcio: true, hierro: true, alergeno: true },
  { id: 'semillas_girasol', nombre: 'Semillas de girasol', grupo: 'grasa', forma: 'semillas', c1: '#eab308', c2: '#78350f', hierro: true },
  { id: 'sesamo', nombre: 'Sésamo', grupo: 'grasa', forma: 'semillas', c1: '#d97706', c2: '#fef3c7', calcio: true, hierro: true },
  { id: 'sesamo_tostado', nombre: 'Sésamo tostado', grupo: 'grasa', forma: 'semillas', c1: '#b45309', c2: '#fde68a', calcio: true, hierro: true },
  { id: 'tahini', nombre: 'Tahini', grupo: 'grasa', forma: 'frasco', c1: '#d6d3d1', c2: '#a8a29e', calcio: true, hierro: true },
  { id: 'canamo', nombre: 'Semillas de cáñamo', grupo: 'grasa', forma: 'semillas', c1: '#854d0e', c2: '#bef264', hierro: true },
  { id: 'bebida_vegetal_fort', nombre: 'Bebida vegetal fortificada', grupo: 'grasa', forma: 'vaso', c1: '#f8fafc', c2: '#93c5fd', calcio: true },

  // 5. Cereales / Tubérculos (26 alimentos según tabla maestra y tabla de fibra/calcio/alérgenos)
  { id: 'amaranto', nombre: 'Amaranto', grupo: 'cereal', forma: 'granos', c1: '#f59e0b', c2: '#fef3c7', fibra: true, calcio: true, hierro: true },
  { id: 'arroz', nombre: 'Arroz', grupo: 'cereal', forma: 'bowl', c1: '#f8fafc', c2: '#ef4444' },
  { id: 'arroz_integral', nombre: 'Arroz integral', grupo: 'cereal', forma: 'bowl', c1: '#d6d3d1', c2: '#b45309', fibra: true },
  { id: 'arvejas', nombre: 'Arvejas', grupo: 'cereal', forma: 'bolitas', c1: '#22c55e', c2: '#16a34a', fibra: true, hierro: true },
  { id: 'avena', nombre: 'Avena', grupo: 'cereal', forma: 'bowl', c1: '#d6d3d1', c2: '#a8a29e', fibra: true, hierro: true },
  { id: 'avena_integral', nombre: 'Avena integral', grupo: 'cereal', forma: 'bowl', c1: '#a8a29e', c2: '#78716c', fibra: true, hierro: true },
  { id: 'burgol', nombre: 'Burgol', grupo: 'cereal', forma: 'granos', c1: '#d97706', c2: '#fde68a', fibra: true, alergeno: true },
  { id: 'camote', nombre: 'Camote', grupo: 'cereal', forma: 'camote', c1: '#ea580c', c2: '#c2410c' },
  { id: 'cebada', nombre: 'Cebada', grupo: 'cereal', forma: 'granos', c1: '#ca8a04', c2: '#fef08a', fibra: true, alergeno: true },
  { id: 'centeno', nombre: 'Centeno', grupo: 'cereal', forma: 'granos', c1: '#78350f', c2: '#d97706', fibra: true, alergeno: true },
  { id: 'maiz', nombre: 'Choclo', grupo: 'cereal', forma: 'choclo', c1: '#facc15', c2: '#22c55e', fibra: true },
  { id: 'cuscus', nombre: 'Cuscús', grupo: 'cereal', forma: 'granos', c1: '#fbbf24', c2: '#fef3c7', alergeno: true },
  { id: 'fideos', nombre: 'Fideo', grupo: 'cereal', forma: 'fideos', c1: '#fbbf24', c2: '#fef3c7', alergeno: true },
  { id: 'fideos_integral', nombre: 'Fideos integral', grupo: 'cereal', forma: 'fideos', c1: '#b45309', c2: '#fde68a', fibra: true, alergeno: true },
  { id: 'habas', nombre: 'Habas', grupo: 'cereal', forma: 'frijol', c1: '#4d7c0f', c2: '#a3e635', fibra: true, hierro: true },
  { id: 'mijo', nombre: 'Mijo', grupo: 'cereal', forma: 'granos', c1: '#eab308', c2: '#fef9c3', hierro: true },
  { id: 'mote', nombre: 'Mote', grupo: 'cereal', forma: 'granos', c1: '#f59e0b', c2: '#fef3c7', fibra: true, alergeno: true },
  { id: 'papa', nombre: 'Papa', grupo: 'cereal', forma: 'papa', c1: '#d97706', c2: '#fde68a' },
  { id: 'platano_verde', nombre: 'Plátano verde', grupo: 'cereal', forma: 'platano', c1: '#65a30d', c2: '#bef264' },
  { id: 'polenta', nombre: 'Polenta', grupo: 'cereal', forma: 'bowl', c1: '#facc15', c2: '#ca8a04' },
  { id: 'porotos_granados', nombre: 'Porotos granados', grupo: 'cereal', forma: 'frijol', c1: '#f97316', c2: '#fef3c7', fibra: true, hierro: true },
  { id: 'quinoa', nombre: 'Quinoa', grupo: 'cereal', forma: 'granos', c1: '#eab308', c2: '#fef08a', fibra: true, hierro: true },
  { id: 'semola', nombre: 'Sémola', grupo: 'cereal', forma: 'bowl', c1: '#fde68a', c2: '#f59e0b', alergeno: true },
  { id: 'trigo_sarraceno', nombre: 'Trigo Sarraceno', grupo: 'cereal', forma: 'granos', c1: '#92400e', c2: '#fcd34d', fibra: true, hierro: true },
  { id: 'yuca', nombre: 'Yuca', grupo: 'cereal', forma: 'camote', c1: '#78350f', c2: '#f5f5f4' },
  { id: 'pan', nombre: 'Pan sin sal', grupo: 'cereal', forma: 'pan', c1: '#d97706', c2: '#fef3c7', alergeno: true },

  // 6. Aliños opcionales (14 aliños según tabla maestra — opcionales en cada plato)
  { id: 'alino_comino', nombre: 'Comino', grupo: 'alino', forma: 'especia', c1: '#92400e', c2: '#d97706', opcional: true },
  { id: 'alino_oregano', nombre: 'Orégano', grupo: 'alino', forma: 'hierba', c1: '#15803d', c2: '#86efac', opcional: true },
  { id: 'alino_albahaca', nombre: 'Albahaca', grupo: 'alino', forma: 'hierba', c1: '#16a34a', c2: '#bbf7d0', opcional: true },
  { id: 'alino_ajo', nombre: 'Ajo', grupo: 'alino', forma: 'ajo', c1: '#f8fafc', c2: '#cbd5e1', opcional: true },
  { id: 'alino_canela', nombre: 'Canela', grupo: 'alino', forma: 'especia', c1: '#9a3412', c2: '#fdba74', opcional: true },
  { id: 'alino_cebolla_polvo', nombre: 'Cebolla en polvo', grupo: 'alino', forma: 'especia', c1: '#eab308', c2: '#fef9c3', opcional: true },
  { id: 'alino_cilantro', nombre: 'Cilantro', grupo: 'alino', forma: 'hierba', c1: '#16a34a', c2: '#4ade80', opcional: true },
  { id: 'alino_curcuma', nombre: 'Cúrcuma', grupo: 'alino', forma: 'especia', c1: '#f59e0b', c2: '#fde047', opcional: true },
  { id: 'alino_eneldo', nombre: 'Eneldo', grupo: 'alino', forma: 'hierba', c1: '#4d7c0f', c2: '#bef264', opcional: true },
  { id: 'alino_laurel', nombre: 'Laurel', grupo: 'alino', forma: 'hoja', c1: '#166534', c2: '#86efac', opcional: true },
  { id: 'alino_perejil', nombre: 'Perejil', grupo: 'alino', forma: 'hierba', c1: '#15803d', c2: '#86efac', opcional: true },
  { id: 'alino_paprika', nombre: 'Paprika', grupo: 'alino', forma: 'especia', c1: '#dc2626', c2: '#fca5a5', opcional: true },
  { id: 'alino_romero', nombre: 'Romero', grupo: 'alino', forma: 'hierba', c1: '#14532d', c2: '#4ade80', opcional: true },
  { id: 'alino_tomillo', nombre: 'Tomillo', grupo: 'alino', forma: 'hierba', c1: '#3f6212', c2: '#a3e635', opcional: true },
];

const CATALOGO_ALIMENTOS_BASE = CATALOGO_ALIMENTOS_RAW.map(normalizarItemAlimento);

const ALIMENTOS_PROHIBIDOS = [
  { nombre: 'Sal', motivo: 'Sobrecarga renal', forma: 'sal', c1: '#cbd5e1', c2: '#94a3b8' },
  { nombre: 'Azúcar y endulzantes', motivo: 'Daño dental, malos hábitos', forma: 'dulce', c1: '#f43f5e', c2: '#fbbf24' },
  { nombre: 'Miel (< 2 años)', motivo: 'Riesgo de botulismo', forma: 'miel', c1: '#d97706', c2: '#fbbf24' },
  { nombre: 'Jugos de fruta', motivo: 'Desplazan nutrientes', forma: 'jugo', c1: '#22c55e', c2: '#f97316' },
  { nombre: 'Leche de vaca / bebidas vegetales', motivo: 'Bloquea absorción de hierro', forma: 'vaso', c1: '#e0f2fe', c2: '#93c5fd' },
  { nombre: 'Cacao', motivo: 'Estimulante, no apto', forma: 'cacao', c1: '#78350f', c2: '#db2777' },
  { nombre: 'Té, café, mate e infusiones', motivo: 'Bloquean absorción de hierro', forma: 'taza', c1: '#64748b', c2: '#65a30d' },
  { nombre: 'Alimentos ultraprocesados', motivo: 'Exceso de sodio y aditivos', forma: 'fritas', c1: '#ef4444', c2: '#facc15' },
  { nombre: 'Uvas y tomates cherry (enteros)', motivo: 'Riesgo de atragantamiento', forma: 'uvas', c1: '#7e22ce', c2: '#22c55e' },
  { nombre: 'Zanahoria y manzana crudas (en trozos)', motivo: 'Riesgo de atragantamiento', forma: 'zanahoria', c1: '#f97316', c2: '#22c55e' },
  { nombre: 'Frutos secos enteros', motivo: 'Riesgo de atragantamiento', forma: 'nuez', c1: '#78350f', c2: '#a16207' },
];

const svgUriCache = new Map();

function dibujoFormaSvg(forma, c1, c2, nombre) {
  switch (forma) {
    case 'brocoli':
      return `<rect x="20" y="25" width="8" height="14" rx="3" fill="${c2}"/><circle cx="17" cy="20" r="8" fill="${c1}"/><circle cx="31" cy="20" r="8" fill="${c1}"/><circle cx="24" cy="14" r="9" fill="${c1}"/>`;
    case 'zanahoria':
      return `<path d="M18 13l-4-6m6 5l2-7m-1 8l5-4" stroke="${c2}" stroke-width="2.5" stroke-linecap="round"/><path d="M16 14c5-2 10 2 14 14 3 7 4 11 2 12-2 1-11-9-16-20-1-3-1-5 0-6z" fill="${c1}"/>`;
    case 'hoja':
      return `<path d="M24 39V22" stroke="#14532d" stroke-width="2.5" stroke-linecap="round"/><path d="M24 9c9 3 13 11 10 19-2 6-10 7-10 7s-8-1-10-7c-3-8 1-16 10-19z" fill="${c1}"/><path d="M24 14v18M24 21l5-4M24 26l-5-4" stroke="${c2}" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'hierba':
      return `<path d="M24 39V14M24 28l-8-7M24 22l8-7" stroke="${c1}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="15" cy="19" rx="5" ry="3" transform="rotate(-30 15 19)" fill="${c1}"/><ellipse cx="33" cy="14" rx="5" ry="3" transform="rotate(30 33 14)" fill="${c2}"/><ellipse cx="24" cy="12" rx="4" ry="6" fill="${c1}"/>`;
    case 'alcachofa':
      return `<circle cx="24" cy="26" r="12" fill="${c1}"/><path d="M16 22c4-5 12-5 16 0M15 28c5-4 13-4 18 0" stroke="${c2}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    case 'esparrago':
      return `<rect x="17" y="12" width="5" height="26" rx="2.5" fill="${c1}"/><rect x="26" y="14" width="5" height="24" rx="2.5" fill="${c2}"/><path d="M17 14l2.5-5 2.5 5zM26 16l2.5-5 2.5 5z" fill="${c1}"/>`;
    case 'berenjena':
      return `<path d="M26 11c-2-3 2-5 4-3" stroke="${c2}" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M22 13c7 0 11 9 9 18-2 6-8 8-13 5-5-3-4-11 0-17 1-3 2-6 4-6z" fill="${c1}"/>`;
    case 'hongo':
      return `<rect x="19" y="24" width="10" height="13" rx="3" fill="${c2}"/><path d="M11 25c0-9 6-14 13-14s13 5 13 14H11z" fill="${c1}"/>`;
    case 'zapallo':
      return `<path d="M24 11v-3" stroke="#15803d" stroke-width="3" stroke-linecap="round"/><ellipse cx="17" cy="25" rx="7" ry="12" fill="${c1}"/><ellipse cx="31" cy="25" rx="7" ry="12" fill="${c1}"/><ellipse cx="24" cy="25" rx="7" ry="13" fill="${c2}"/>`;
    case 'bulbo':
      return `<path d="M24 14l-5-7m5 7V6m0 8l5-7" stroke="#22c55e" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="26" r="11" fill="${c1}"/><path d="M24 37l-1 4" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`;
    case 'tomate':
      return `<circle cx="24" cy="26" r="12" fill="${c1}"/><path d="M19 15l5 3 5-3-3 4 4 2-6-1-6 1 4-2z" fill="${c2}"/>`;
    case 'calabacin':
      return `<rect x="10" y="18" width="28" height="12" rx="6" transform="rotate(-18 24 24)" fill="${c1}"/><circle cx="35" cy="18" r="2.5" fill="${c2}"/>`;
    case 'pimenton':
      return `<path d="M24 12v-3" stroke="${c2}" stroke-width="3" stroke-linecap="round"/><rect x="13" y="14" width="22" height="22" rx="8" fill="${c1}"/><path d="M20 15v20m8-20v20" stroke="#7f1d1d" stroke-width="1.2" opacity="0.4"/>`;
    case 'bolitas':
      return `<circle cx="17" cy="21" r="6" fill="${c1}"/><circle cx="30" cy="20" r="6" fill="${c2}"/><circle cx="24" cy="30" r="6" fill="${c1}"/>`;
    case 'vainas':
      return `<path d="M12 29c6-10 15-14 25-11" fill="none" stroke="${c1}" stroke-width="5" stroke-linecap="round"/><path d="M14 34c7-8 16-10 23-6" fill="none" stroke="${c2}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'platano':
      return `<path d="M12 30c6 5 18 3 23-7 2-5 1-10-1-13-2 7-9 13-22 20z" fill="${c1}" stroke="#ca8a04" stroke-width="1.2"/>`;
    case 'citrico':
      return `<circle cx="24" cy="24" r="13" fill="${c1}"/><circle cx="24" cy="24" r="10" fill="${c2}" opacity="0.85"/><path d="M24 14v20M14 24h20M17 17l14 14M31 17L17 31" stroke="${c1}" stroke-width="1.5"/>`;
    case 'frutilla':
      return `<path d="M16 14h16l-8 5z" fill="${c2}"/><path d="M14 18c0 10 6 20 10 20s10-10 10-20c0-3-4-4-10-4s-10 1-10 4z" fill="${c1}"/><circle cx="20" cy="22" r="1.1" fill="#fef08a"/><circle cx="28" cy="22" r="1.1" fill="#fef08a"/><circle cx="24" cy="28" r="1.1" fill="#fef08a"/><circle cx="21" cy="32" r="1" fill="#fef08a"/>`;
    case 'cereza':
      return `<path d="M17 26c1-8 6-14 10-16 1 5 3 11 5 16" fill="none" stroke="${c2}" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="30" r="6" fill="${c1}"/><circle cx="31" cy="30" r="6" fill="${c1}"/>`;
    case 'manzana':
      return `<path d="M24 13v-4l4-2" stroke="#15803d" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M24 14c-6-3-12 2-11 11 1 8 6 13 11 11 5 2 10-3 11-11 1-9-5-14-11-11z" fill="${c1}"/><ellipse cx="20" cy="22" rx="2.5" ry="5" fill="${c2}" opacity="0.4"/>`;
    case 'berries':
      return `<circle cx="18" cy="27" r="6.5" fill="${c1}"/><circle cx="30" cy="27" r="6.5" fill="${c2}"/><circle cx="24" cy="18" r="6.5" fill="${c1}"/><circle cx="24" cy="15" r="1.5" fill="#c7d2fe"/>`;
    case 'kiwi':
      return `<circle cx="24" cy="24" r="13" fill="${c2}"/><circle cx="24" cy="24" r="10.5" fill="${c1}"/><ellipse cx="24" cy="24" rx="4" ry="3" fill="#ecfccb"/>`;
    case 'sandia':
      return `<path d="M10 20h28c-1 10-7 16-14 16S11 30 10 20z" fill="${c2}"/><path d="M13 20h22c-1 7-5 12-11 12s-10-5-11-12z" fill="${c1}"/><circle cx="20" cy="25" r="1.2" fill="#1e293b"/><circle cx="28" cy="25" r="1.2" fill="#1e293b"/><circle cx="24" cy="28" r="1.2" fill="#1e293b"/>`;
    case 'pina':
      return `<path d="M20 13l-3-5m7 5V7m4 6l3-5" stroke="${c2}" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="24" cy="26" rx="9" ry="12" fill="${c1}"/><path d="M18 20l12 12M30 20L18 32" stroke="#ca8a04" stroke-width="1.5" opacity="0.6"/>`;
    case 'fruta_redonda':
      return `<path d="M24 12v-4" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round"/><circle cx="24" cy="25" r="12" fill="${c1}"/><circle cx="20" cy="21" r="3.5" fill="${c2}" opacity="0.5"/>`;
    case 'pera':
      return `<path d="M24 10v-3" stroke="#78350f" stroke-width="2.2" stroke-linecap="round"/><path d="M24 10c4 0 5 5 7 9 3 4 4 10 0 14-3 3-11 3-14 0-4-4-3-10 0-14 2-4 3-9 7-9z" fill="${c1}"/>`;
    case 'uvas':
      return `<path d="M24 11V7l4-2" stroke="${c2}" stroke-width="2" fill="none"/><circle cx="20" cy="17" r="4.5" fill="${c1}"/><circle cx="28" cy="17" r="4.5" fill="${c1}"/><circle cx="16" cy="24" r="4.5" fill="${c1}"/><circle cx="24" cy="24" r="4.5" fill="${c1}"/><circle cx="32" cy="24" r="4.5" fill="${c1}"/><circle cx="20" cy="31" r="4.5" fill="${c1}"/><circle cx="28" cy="31" r="4.5" fill="${c1}"/><circle cx="24" cy="37" r="4.2" fill="${c1}"/>`;
    case 'legumbres':
      return `<ellipse cx="16" cy="21" rx="5.5" ry="4.5" fill="${c1}"/><ellipse cx="30" cy="20" rx="5.5" ry="4.5" fill="${c2}"/><ellipse cx="22" cy="30" rx="5.5" ry="4.5" fill="${c1}"/><ellipse cx="32" cy="30" rx="5" ry="4" fill="${c2}"/>`;
    case 'cubos':
      return `<rect x="11" y="18" width="14" height="14" rx="2.5" fill="${c1}" stroke="${c2}" stroke-width="1.5"/><rect x="23" y="13" width="14" height="14" rx="2.5" fill="${c1}" stroke="${c2}" stroke-width="1.5"/>`;
    case 'frijol':
      return `<path d="M14 22c-2-5 4-9 8-6 3 2 3 8-1 10-3 2-6-1-7-4z" fill="${c1}"/><path d="M25 25c-2-5 4-9 8-6 3 2 3 8-1 10-3 2-6-1-7-4z" fill="${c2}"/>`;
    case 'granos':
      return `<circle cx="16" cy="20" r="3.5" fill="${c1}"/><circle cx="25" cy="16" r="3.5" fill="${c2}"/><circle cx="33" cy="22" r="3.5" fill="${c1}"/><circle cx="20" cy="29" r="3.5" fill="${c2}"/><circle cx="29" cy="31" r="3.5" fill="${c1}"/><circle cx="23" cy="23" r="3" fill="${c1}"/>`;
    case 'filete':
      return `<path d="M11 22c0-7 8-10 17-9 7 1 11 5 10 11-1 7-7 11-16 11-7 0-11-5-11-13z" fill="${c1}"/><path d="M16 20c4-2 9-1 12 2" stroke="${c2}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'huevo':
      return `<ellipse cx="24" cy="24" rx="11" ry="14" fill="${c1}" stroke="#e2e8f0" stroke-width="1.2"/><circle cx="24" cy="26" r="6" fill="${c2}"/>`;
    case 'ave':
      return `<path d="M13 24c0-7 7-11 14-9 4 1 6 5 4 9l8 6-3 3-8-5c-7 4-15 2-15-4z" fill="${c1}"/><circle cx="37" cy="31" r="2.2" fill="${c2}"/>`;
    case 'pez':
      return `<path d="M10 24c5-8 16-9 23-3l6-4v14l-6-4c-7 6-18 5-23-3z" fill="${c1}"/><circle cx="17" cy="23" r="1.6" fill="#0f172a"/><path d="M22 20v8M27 21v6" stroke="${c2}" stroke-width="1.5"/>`;
    case 'marisco':
      return `<path d="M15 28c-3-7 3-14 11-14 7 0 11 6 8 12-2 4-7 4-9 2" fill="none" stroke="${c1}" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="18" r="1.5" fill="${c2}"/>`;
    case 'palta':
      return `<path d="M24 9c5 0 10 8 10 17 0 7-4 12-10 12s-10-5-10-12c0-9 5-17 10-17z" fill="${c1}"/><ellipse cx="24" cy="25" rx="7" ry="10" fill="#bef264"/><circle cx="24" cy="28" r="4.8" fill="${c2}"/>`;
    case 'botella':
      return `<rect x="21" y="8" width="6" height="6" rx="1" fill="#ca8a04"/><path d="M20 14h8l4 7v15a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V21l4-7z" fill="${c1}"/><rect x="19" y="24" width="10" height="8" rx="1.5" fill="${c2}"/>`;
    case 'frasco':
      return `<rect x="16" y="10" width="16" height="5" rx="2" fill="#475569"/><rect x="14" y="15" width="20" height="22" rx="4" fill="${c1}"/><rect x="17" y="21" width="14" height="9" rx="2" fill="${c2}"/>`;
    case 'semillas':
      return `<ellipse cx="18" cy="19" rx="3" ry="4.5" transform="rotate(-20 18 19)" fill="${c1}"/><ellipse cx="28" cy="18" rx="3" ry="4.5" transform="rotate(25 28 18)" fill="${c2}"/><ellipse cx="22" cy="30" rx="3" ry="4.5" transform="rotate(15 22 30)" fill="${c1}"/><ellipse cx="31" cy="29" rx="3" ry="4.5" transform="rotate(-15 31 29)" fill="${c2}"/>`;
    case 'especia':
      return `<path d="M12 31c4-9 9-14 12-14s8 5 12 14H12z" fill="${c1}"/><circle cx="20" cy="14" r="2" fill="${c2}"/><circle cx="28" cy="15" r="1.8" fill="${c1}"/><circle cx="24" cy="11" r="1.5" fill="${c2}"/>`;
    case 'ajo':
      return `<path d="M24 10c-2 5-10 8-10 17 0 6 4 10 10 10s10-4 10-10c0-9-8-12-10-17z" fill="${c1}" stroke="${c2}" stroke-width="1.8"/><path d="M24 12v25M20 15c-2 6-2 15 0 21M28 15c2 6 2 15 0 21" stroke="${c2}" stroke-width="1.2" fill="none"/>`;
    case 'bowl':
      return `<ellipse cx="24" cy="21" rx="13" ry="7" fill="${c1}"/><path d="M10 22h28c-1 10-7 15-14 15S11 32 10 22z" fill="${c2}"/>`;
    case 'papa':
      return `<ellipse cx="24" cy="24" rx="14" ry="10" transform="rotate(-12 24 24)" fill="${c1}"/><circle cx="19" cy="22" r="1.5" fill="${c2}"/><circle cx="29" cy="26" r="1.5" fill="${c2}"/>`;
    case 'fideos':
      return `<path d="M12 21c6-6 12 6 18 0s8 6 6 6M12 28c6-6 12 6 18 0s8 6 6 6" fill="none" stroke="${c1}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'camote':
      return `<path d="M10 28c3-9 18-15 28-8-3 9-18 15-28 8z" fill="${c1}"/><path d="M16 25l16-3" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`;
    case 'pan':
      return `<path d="M14 21c-2-5 3-10 10-10s12 5 10 10v13H14V21z" fill="${c1}"/><path d="M17 22c-1-3 2-7 7-7s8 4 7 7v9H17v-9z" fill="${c2}"/>`;
    case 'choclo':
      return `<ellipse cx="24" cy="22" rx="7" ry="13" fill="${c1}"/><path d="M16 25c2 8 6 11 8 11s6-3 8-11c-4 3-12 3-16 0z" fill="${c2}"/>`;
    case 'sal':
      return `<rect x="17" y="10" width="14" height="5" rx="2" fill="${c2}"/><path d="M16 15h16l2 22H14l2-22z" fill="${c1}"/>`;
    case 'dulce':
      return `<path d="M11 24l6-4v8l-6-4zm26 0l-6-4v8l6-4z" fill="${c2}"/><circle cx="24" cy="24" r="8" fill="${c1}"/>`;
    case 'miel':
      return `<path d="M16 15h16v18a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V15z" fill="${c1}"/><rect x="14" y="11" width="20" height="4" rx="2" fill="${c2}"/>`;
    case 'jugo':
      return `<path d="M28 8l-3 7" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/><rect x="15" y="15" width="18" height="22" rx="3" fill="${c1}"/><circle cx="24" cy="26" r="5" fill="${c2}"/>`;
    case 'vaso':
      return `<path d="M15 12h18l-2 24H17L15 12z" fill="${c2}"/><path d="M16 18h16l-1.5 17h-13L16 18z" fill="${c1}"/>`;
    case 'cacao':
      return `<rect x="15" y="11" width="18" height="26" rx="2" fill="${c1}"/><path d="M15 24h18v13H15z" fill="${c2}"/>`;
    case 'taza':
      return `<path d="M13 18h18v12a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6V18z" fill="${c1}"/><path d="M31 20h3a3 3 0 0 1 0 6h-3" fill="none" stroke="${c1}" stroke-width="2.5"/><path d="M18 14v-3m6 3v-4m6 4v-3" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`;
    case 'fritas':
      return `<path d="M17 11v12m5-14v14m5-13v13m4-11v11" stroke="${c2}" stroke-width="3" stroke-linecap="round"/><path d="M14 20h20l-2 16H16l-2-16z" fill="${c1}"/>`;
    case 'nuez':
      return `<path d="M14 25c0-8 5-13 10-13s10 5 10 13c0 5-4 8-10 8s-10-3-10-8z" fill="${c1}"/><path d="M14 25h20" stroke="${c2}" stroke-width="2"/>`;
    default: {
      const ch = escapeHtml((nombre || '?').trim().charAt(0).toUpperCase() || 'A');
      return `<circle cx="24" cy="24" r="13" fill="${c1}" opacity="0.22"/><circle cx="24" cy="24" r="10" fill="${c1}"/><text x="24" y="29" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="800" fill="#fff">${ch}</text>`;
    }
  }
}

function alimentoSvgDataUri(alimento) {
  const key = `${alimento?.id || alimento?.nombre}_${alimento?.forma || 'custom'}_${alimento?.c1 || ''}`;
  if (svgUriCache.has(key)) return svgUriCache.get(key);
  const gInfo = GRUPOS_COMIDA.find((g) => g.key === alimento?.grupo);
  const c1 = alimento?.c1 || gInfo?.color || (alimento?.grupo === 'alino' ? '#16a34a' : '#3987e5');
  const c2 = alimento?.c2 || '#e2e8f0';
  const body = dibujoFormaSvg(alimento?.forma || 'custom', c1, c2, alimento?.nombreBase || alimento?.nombre || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`;
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  svgUriCache.set(key, uri);
  return uri;
}

let comidaDraftPlato = { verdura: null, fruta: null, proteina: null, grasa: null, cereal: null };
let comidaDraftAlinos = [];
let comidaGrupoActivo = null;
let comidaCatalogoFiltroGrupo = 'todos';
let comidaModalId = null;

function leerComidaCustom() {
  const rec = (cache.bitacora || []).find((r) => r.titulo === SYSTEM_COMIDA_CUSTOM);
  const base = { customFoods: [], manualProbados: [], manualAlergias: {} };
  if (!rec?.notas) return base;
  try {
    const parsed = JSON.parse(rec.notas);
    return {
      customFoods: Array.isArray(parsed.customFoods) ? parsed.customFoods : [],
      manualProbados: Array.isArray(parsed.manualProbados) ? parsed.manualProbados : [],
      manualAlergias: (parsed.manualAlergias && typeof parsed.manualAlergias === 'object') ? parsed.manualAlergias : {},
    };
  } catch {
    return base;
  }
}

async function guardarComidaCustom(dataObj) {
  if (!bebe?.id) return;
  const notasStr = JSON.stringify(dataObj);
  const today = dayKey(new Date());
  const rec = (cache.bitacora || []).find((r) => r.titulo === SYSTEM_COMIDA_CUSTOM);
  if (rec?.id) {
    await db.from('bitacora').update({ notas: notasStr, fecha: today }).eq('id', rec.id);
  } else {
    await db.from('bitacora').insert({ bebe_id: bebe.id, titulo: SYSTEM_COMIDA_CUSTOM, fecha: today, notas: notasStr });
  }
  await loadData('bitacora');
}

function obtenerCatalogoAlimentos() {
  const custom = leerComidaCustom().customFoods;
  const mapa = new Map();
  for (const a of CATALOGO_ALIMENTOS_BASE) mapa.set(a.id, a);
  for (const c of custom) {
    if (c?.id && c?.nombre && c?.grupo) {
      mapa.set(c.id, normalizarItemAlimento({ ...c, opcional: c.grupo === 'alino' }));
    }
  }
  return Array.from(mapa.values());
}

function leerPlatosComida() {
  const rows = (cache.bitacora || []).filter((r) => r.titulo === SYSTEM_COMIDA_PLATO);
  const platos = [];
  for (const r of rows) {
    try {
      const p = JSON.parse(r.notas || '{}');
      platos.push({
        id: r.id,
        fecha: p.fecha || r.fecha,
        hora: p.hora || '12:00',
        tiempo: p.tiempo || 'Almuerzo',
        ingredientes: p.ingredientes || {},
        alinos: Array.isArray(p.alinos) ? p.alinos : [],
        alimentoNuevo: p.alimentoNuevo || null,
        alimentoNuevoGrupo: p.alimentoNuevoGrupo || null,
        reacciones: Array.isArray(p.reacciones) ? p.reacciones : [],
        sintomas: Array.isArray(p.sintomas) ? p.sintomas : [],
        reaccionNotas: p.reaccionNotas || '',
        notas: p.notas || '',
      });
    } catch {}
  }
  return platos.sort((a, b) => {
    const fCmp = (b.fecha || '').localeCompare(a.fecha || '');
    if (fCmp !== 0) return fCmp;
    return (b.hora || '').localeCompare(a.hora || '');
  });
}

function calcularContextoComidas(fechaSel) {
  const catalogo = obtenerCatalogoAlimentos();
  const alimentosPrincipales = catalogo.filter((a) => a.grupo !== 'alino');
  const alinosCatalogo = catalogo.filter((a) => a.grupo === 'alino');
  const catalogoMap = new Map(catalogo.map((a) => [a.id, a]));
  const custom = leerComidaCustom();
  const platos = leerPlatosComida();
  const platosAsc = [...platos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora || '').localeCompare(b.hora || ''));

  const fechaRef = fechaSel || dayKey(new Date());
  const fechas = platosAsc.map((p) => p.fecha).filter(Boolean);
  const fechaInicio = fechas.length ? fechas.reduce((min, f) => (f < min ? f : min), fechaRef) : fechaRef;

  const diasEntre = (f1, f2) => Math.round((new Date(f2 + 'T12:00') - new Date(f1 + 'T12:00')) / 86400000);
  const semanaDe = (f) => Math.max(1, Math.floor(diasEntre(fechaInicio, f) / 7) + 1);
  const semanaActual = semanaDe(fechaRef);

  const probadosHistoricos = new Set(custom.manualProbados);
  const alergiasMap = new Map();
  for (const [id, info] of Object.entries(custom.manualAlergias || {})) {
    if (info) alergiasMap.set(id, info);
  }

  const usadosPorSemana = new Map();
  const platosHoy = [];
  let totalNuevosHistorico = 0;

  for (const p of platosAsc) {
    const sem = semanaDe(p.fecha);
    if (!usadosPorSemana.has(sem)) usadosPorSemana.set(sem, new Set());
    const setSem = usadosPorSemana.get(sem);
    Object.values(p.ingredientes || {}).forEach((id) => {
      if (id) {
        probadosHistoricos.add(id);
        setSem.add(id);
      }
    });
    for (const alinoId of (p.alinos || [])) {
      if (alinoId) probadosHistoricos.add(alinoId);
    }
    if (p.alimentoNuevo) totalNuevosHistorico++;
    if (p.fecha === fechaRef) platosHoy.push(p);
    for (const alId of (p.reacciones || [])) {
      alergiasMap.set(alId, { fecha: p.fecha, sintomas: p.sintomas || [], notas: p.reaccionNotas || '' });
    }
  }

  const usadosSemanaAnterior = semanaActual > 1 ? (usadosPorSemana.get(semanaActual - 1) || new Set()) : new Set();
  const usadosEstaSemana = usadosPorSemana.get(semanaActual) || new Set();
  const yaHayNuevoHoy = platosHoy.some((p) => Boolean(p.alimentoNuevo));
  const grupoSugerido = GRUPOS_COMIDA[totalNuevosHistorico % GRUPOS_COMIDA.length];

  // Si el grupo en turno ya tiene todos probados, buscar primer grupo con alimentos sin probar
  const pendientesPorGrupo = (gk) => alimentosPrincipales.filter((a) => a.grupo === gk && !probadosHistoricos.has(a.id));
  const grupoRealSugerido = pendientesPorGrupo(grupoSugerido.key).length
    ? grupoSugerido
    : (GRUPOS_COMIDA.find((g) => pendientesPorGrupo(g.key).length > 0) || grupoSugerido);

  // Determinar qué ingredientes están bloqueados por la regla semanal por grupo
  const bloqueadosPorGrupo = {};
  for (const g of GRUPOS_COMIDA) {
    const delGrupo = alimentosPrincipales.filter((a) => a.grupo === g.key && !alergiasMap.has(a.id));
    const disponiblesNoSemanaAnt = delGrupo.filter((a) => !usadosSemanaAnterior.has(a.id));
    bloqueadosPorGrupo[g.key] = disponiblesNoSemanaAnt.length > 0 ? usadosSemanaAnterior : new Set();
  }

  return {
    catalogo,
    alimentosPrincipales,
    alinosCatalogo,
    catalogoMap,
    platos,
    fechaInicio,
    fechaRef,
    semanaActual,
    probadosHistoricos,
    alergiasMap,
    usadosSemanaAnterior,
    usadosEstaSemana,
    bloqueadosPorGrupo,
    yaHayNuevoHoy,
    grupoSugerido: grupoRealSugerido,
  };
}

function renderPlatoVisualSlots(ctx) {
  const slotsWrap = $('platoVisualSlots');
  if (!slotsWrap) return;

  let alimentoNuevoEnDraft = null;
  let cantNuevosDraft = 0;

  slotsWrap.innerHTML = GRUPOS_COMIDA.map((g) => {
    const idSel = comidaDraftPlato[g.key];
    const item = idSel ? ctx.catalogoMap.get(idSel) : null;
    const activo = comidaGrupoActivo === g.key;
    let badge = '';
    if (item) {
      const esAlergia = ctx.alergiasMap.has(item.id);
      const esNuevo = !ctx.probadosHistoricos.has(item.id);
      if (esNuevo) {
        cantNuevosDraft++;
        alimentoNuevoEnDraft = { item, grupo: g };
      }
      if (esAlergia) badge = '<span class="plato-slot-tag alergia">🚨 Alergia</span>';
      else if (esNuevo) badge = '<span class="plato-slot-tag nuevo">✨ Nuevo</span>';
    }
    return `
      <button type="button" class="plato-slot${activo ? ' active' : ''}" data-grupo="${g.key}" style="--grupo-color:${g.color}">
        <div class="plato-slot-head">
          <span>${g.icono} ${g.nombre}</span>
          ${badge}
        </div>
        ${item ? `
          <div class="plato-slot-body">
            <img class="alimento-thumb" src="${alimentoSvgDataUri(item)}" alt="${escapeHtml(item.nombre)}">
            <strong style="font-size:0.8rem; color:var(--text); line-height:1.2;">${escapeHtml(item.nombre)}</strong>
          </div>
        ` : `<div class="plato-slot-empty">＋ Elegir ${g.nombre.toLowerCase()}</div>`}
      </button>
    `;
  }).join('');

  const resumenEl = $('comidaAlimentoNuevoResumen');
  if (resumenEl) {
    if (ctx.yaHayNuevoHoy && cantNuevosDraft > 0) {
      resumenEl.innerHTML = '⚠️ Ya registraste un alimento nuevo hoy. Quita el alimento nuevo del plato o cambia a uno ya probado.';
      resumenEl.style.color = '#ef4444';
    } else if (alimentoNuevoEnDraft) {
      resumenEl.innerHTML = `✨ Alimento nuevo de hoy: <strong>${escapeHtml(alimentoNuevoEnDraft.item.nombre)}</strong> (${alimentoNuevoEnDraft.grupo.nombre}). El resto completa el plato sin repetir la semana anterior.`;
      resumenEl.style.color = '#199e70';
    } else {
      resumenEl.innerHTML = `💡 Toca <strong>${ctx.grupoSugerido.icono} ${ctx.grupoSugerido.nombre}</strong> para introducir 1 alimento nuevo hoy, o usa <strong>🎲 Sugerir plato</strong>.`;
      resumenEl.style.color = 'var(--text-2)';
    }
  }
}

function renderAlinosSelector(ctx) {
  const grid = $('platoAlinosGrid');
  if (!grid) return;
  const selSet = new Set(comidaDraftAlinos);
  const btnClear = $('btnLimpiarAlinos');
  if (btnClear) btnClear.classList.toggle('hidden', selSet.size === 0);

  grid.innerHTML = ctx.alinosCatalogo.map((al) => {
    const activo = selSet.has(al.id);
    const esAlergia = ctx.alergiasMap.has(al.id);
    return `
      <button type="button" class="alino-chip${activo ? ' selected' : ''}" data-alino-id="${al.id}" title="Aliño opcional: toca para agregar o quitar del plato">
        <img class="alimento-thumb-sm" src="${alimentoSvgDataUri(al)}" alt="${escapeHtml(al.nombre)}">
        <span>${escapeHtml(al.nombre)}${esAlergia ? ' 🚨' : ''}</span>
      </button>
    `;
  }).join('');
}

function renderSelectorGrupoComida(ctx) {
  const wrap = $('platoSelectorGrupoWrap');
  if (!wrap) return;
  if (!comidaGrupoActivo) {
    wrap.classList.add('hidden');
    return;
  }
  const gInfo = GRUPOS_COMIDA.find((g) => g.key === comidaGrupoActivo);
  if (!gInfo) return;

  wrap.classList.remove('hidden');
  $('platoSelectorTitulo').textContent = `${gInfo.icono} Elige ${gInfo.nombre} (Semana ${ctx.semanaActual})`;
  const search = ($('platoSelectorSearch')?.value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bloqueados = ctx.bloqueadosPorGrupo[gInfo.key] || new Set();

  // Revisar si otro slot del draft ya tiene un alimento nuevo
  const otroNuevoEnDraft = Object.entries(comidaDraftPlato).some(
    ([gk, id]) => gk !== gInfo.key && id && !ctx.probadosHistoricos.has(id)
  );

  const items = ctx.alimentosPrincipales
    .filter((a) => {
      if (a.grupo !== gInfo.key) return false;
      if (!search) return true;
      const norm = a.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes(search);
    })
    .sort((a, b) => {
      const aBloq = bloqueados.has(a.id) ? 1 : 0;
      const bBloq = bloqueados.has(b.id) ? 1 : 0;
      if (aBloq !== bBloq) return aBloq - bBloq;
      const aProb = ctx.probadosHistoricos.has(a.id) ? 1 : 0;
      const bProb = ctx.probadosHistoricos.has(b.id) ? 1 : 0;
      return aProb - bProb; // Priorizar nuevos primero si están permitidos
    });

  const quitarBtn = comidaDraftPlato[gInfo.key]
    ? '<button type="button" class="alimento-item" data-pick-alimento=""><span>✕</span><div class="alimento-info"><strong>Vaciar sección</strong><small>Dejar sin ingrediente</small></div></button>'
    : '';

  $('platoSelectorOpciones').innerHTML = quitarBtn + items.map((a) => {
    const seleccionado = comidaDraftPlato[gInfo.key] === a.id;
    const bloqSemana = bloqueados.has(a.id);
    const esNuevo = !ctx.probadosHistoricos.has(a.id);
    const esAlergia = ctx.alergiasMap.has(a.id);
    const bloqReglaNuevo = esNuevo && (ctx.yaHayNuevoHoy || otroNuevoEnDraft);
    const disabled = bloqSemana || bloqReglaNuevo;

    let sub = '✓ Ya integrado';
    if (esAlergia) sub = '🚨 Causó alergia';
    else if (bloqSemana) sub = '🔒 Semana anterior';
    else if (bloqReglaNuevo) sub = '🔒 Máx 1 nuevo/día';
    else if (esNuevo) sub = '✨ Nuevo (por probar)';

    return `
      <button type="button" class="alimento-item${seleccionado ? ' selected' : ''}${disabled ? ' bloqueado' : ''}${esAlergia ? ' alergia' : ''}" data-pick-alimento="${a.id}" ${disabled ? 'disabled' : ''}>
        <img class="alimento-thumb" src="${alimentoSvgDataUri(a)}" alt="${escapeHtml(a.nombre)}">
        <div class="alimento-info">
          <strong>${escapeHtml(a.nombre)}</strong>
          <small>${sub}</small>
        </div>
      </button>
    `;
  }).join('');
}

function renderCatalogoComidas(ctx) {
  const filtroWrap = $('comidaCatalogoFiltro');
  const gridWrap = $('comidaCatalogoGrid');
  if (!filtroWrap || !gridWrap) return;

  filtroWrap.innerHTML = [
    `<button type="button" class="chip-filter${comidaCatalogoFiltroGrupo === 'todos' ? ' active' : ''}" data-cat-grupo="todos">Todos (${ctx.catalogo.length})</button>`,
    ...GRUPOS_COMIDA.map((g) => {
      const cnt = ctx.alimentosPrincipales.filter((a) => a.grupo === g.key).length;
      return `<button type="button" class="chip-filter${comidaCatalogoFiltroGrupo === g.key ? ' active' : ''}" data-cat-grupo="${g.key}">${g.icono} ${g.nombre} (${cnt})</button>`;
    }),
    `<button type="button" class="chip-filter${comidaCatalogoFiltroGrupo === 'alino' ? ' active' : ''}" data-cat-grupo="alino">🧂 Aliños (${ctx.alinosCatalogo.length})</button>`,
  ].join('');

  const list = ctx.catalogo.filter((a) => comidaCatalogoFiltroGrupo === 'todos' || a.grupo === comidaCatalogoFiltroGrupo);
  gridWrap.innerHTML = list.map((a) => {
    const probado = ctx.probadosHistoricos.has(a.id);
    const alergia = ctx.alergiasMap.has(a.id);
    const usadoSemAnt = ctx.usadosSemanaAnterior.has(a.id);
    let estado = a.grupo === 'alino' ? '🧂 Aliño opcional' : '⏳ Pendiente';
    if (alergia) estado = '🚨 Alergia detectada';
    else if (usadoSemAnt && a.grupo !== 'alino') estado = '🔒 Usado sem. anterior';
    else if (probado) estado = a.grupo === 'alino' ? '✓ Aliño usado' : '✓ Probado / Integrado';
    return `
      <button type="button" class="alimento-item${probado ? ' selected' : ''}${alergia ? ' alergia' : ''}" data-toggle-cat="${a.id}" title="Toca para marcar/desmarcar como ya probado antes de usar la app">
        <img class="alimento-thumb" src="${alimentoSvgDataUri(a)}" alt="${escapeHtml(a.nombre)}">
        <div class="alimento-info">
          <strong>${escapeHtml(a.nombre)}</strong>
          <small>${estado}</small>
        </div>
      </button>
    `;
  }).join('');
}

function renderGuiasComidas() {
  const guia = $('comidaGuiaNutrientes');
  if (guia && !guia.dataset.rendered) {
    guia.dataset.rendered = '1';
    guia.innerHTML = `
      <div class="faq-item">
        <strong>Paso a paso para iniciar</strong>
        <p><strong>Paso N°1:</strong> Todos los días integra 1 alimento nuevo por grupo intentando armar un plato completo.<br>
        <strong>Paso N°2:</strong> Repite el orden (Verdura → Fruta → Proteína → Grasa → Cereal/Tubérculo), siempre integrando 1 alimento nuevo por día y completando con alimentos ya probados.<br>
        <strong>Regla clave:</strong> Nunca 2 alimentos nuevos el mismo día. Así detectas posibles reacciones alérgicas.<br>
        <strong>Simbología al final del nombre:</strong> 🌾 Alto en fibra · 🦷 Alto en calcio · 🌿 Alto en hierro · ❗ Alérgeno.</p>
      </div>
      ${GRUPOS_COMIDA.map((g) => `
        <div class="faq-item" style="border-left:4px solid ${g.color};">
          <strong>${g.icono} ${g.nombre}</strong>
          <p><strong>Nutrientes clave:</strong> ${g.nutrientes}<br><strong>Tip práctico:</strong> ${g.tip}</p>
        </div>
      `).join('')}
    `;
  }

  const proh = $('comidaProhibidosLista');
  if (proh && !proh.dataset.rendered) {
    proh.dataset.rendered = '1';
    proh.innerHTML = `
      <div class="prohibidos-grid">
        ${ALIMENTOS_PROHIBIDOS.map((p) => `
          <div class="prohibido-card">
            <img class="alimento-thumb" src="${alimentoSvgDataUri({ id: 'proh_' + p.forma, nombre: p.nombre, forma: p.forma, c1: p.c1, c2: p.c2 })}" alt="${escapeHtml(p.nombre)}">
            <div>
              <strong>${escapeHtml(p.nombre)}</strong>
              <small>⚠️ ${escapeHtml(p.motivo)}</small>
            </div>
          </div>
        `).join('')}
      </div>
      <p class="form-hint" style="margin-top:10px;">💡 Frutos secos, maní, zanahoria y manzana <strong>SÍ se pueden ofrecer</strong> si se modifica la textura (molidos, cocidos, untables).</p>
    `;
  }
}

function renderComidas() {
  if (!$('tab-comidas')) return;
  if ($('comidaFecha') && !$('comidaFecha').value) $('comidaFecha').value = dayKey(new Date());
  if ($('comidaHora') && !$('comidaHora').value) $('comidaHora').value = fmtTime(new Date());

  const fechaSel = $('comidaFecha')?.value || dayKey(new Date());
  const ctx = calcularContextoComidas(fechaSel);

  const probadosCount = ctx.alimentosPrincipales.filter((a) => ctx.probadosHistoricos.has(a.id)).length;
  const totalCat = ctx.alimentosPrincipales.length || 1;
  const pct = Math.min(100, Math.round((probadosCount / totalCat) * 100));

  if ($('comidaSemanaActual')) $('comidaSemanaActual').textContent = `Semana ${ctx.semanaActual}`;
  if ($('comidaAlimentosProbados')) $('comidaAlimentosProbados').textContent = `${probadosCount} / ${totalCat}`;
  if ($('comidaGrupoSugeridoHoy')) $('comidaGrupoSugeridoHoy').textContent = `${ctx.grupoSugerido.icono} ${ctx.grupoSugerido.nombre}`;
  if ($('comidaAlergiasDetectadas')) $('comidaAlergiasDetectadas').textContent = String(ctx.alergiasMap.size);
  if ($('comidaCatalogoStatus')) $('comidaCatalogoStatus').textContent = `${probadosCount} de ${totalCat} alimentos integrados (${pct}%) · +${ctx.alinosCatalogo.length} aliños opcionales`;
  if ($('comidaCatalogoBar')) $('comidaCatalogoBar').style.width = `${pct}%`;

  const bloqueadosNombres = Array.from(ctx.usadosSemanaAnterior)
    .map((id) => ctx.catalogoMap.get(id)?.nombre)
    .filter(Boolean);
  if ($('comidaReglaTexto')) {
    if (ctx.semanaActual > 1 && bloqueadosNombres.length > 0) {
      $('comidaReglaTexto').innerHTML = `<strong>Rotación Semana ${ctx.semanaActual}:</strong> No se pueden repetir ingredientes de la semana anterior (${bloqueadosNombres.slice(0, 6).map(escapeHtml).join(', ')}${bloqueadosNombres.length > 6 ? '…' : ''}) hasta completar el catálogo. Introduce 1 alimento nuevo por día.`;
    } else {
      $('comidaReglaTexto').innerHTML = '<strong>Regla clave (Semana 1):</strong> Introduce <strong>1 alimento nuevo por día</strong> rotando los 5 grupos. Nunca 2 alimentos nuevos el mismo día para detectar reacciones.';
    }
  }

  renderPlatoVisualSlots(ctx);
  renderSelectorGrupoComida(ctx);
  renderAlinosSelector(ctx);
  renderCatalogoComidas(ctx);
  renderGuiasComidas();

  $('tablaComidas').innerHTML = tablaHTML(
    ['Hora / Comida', 'Plato e ingredientes'],
    groupByDay(ctx.platos, 'fecha'),
    (p) => {
      const pillsPrincipales = GRUPOS_COMIDA.map((g) => {
        const id = p.ingredientes?.[g.key];
        if (!id) return '';
        const item = ctx.catalogoMap.get(id) || { id, nombre: id, grupo: g.key };
        const esNuevo = p.alimentoNuevo === id;
        const esAlergia = (p.reacciones || []).includes(id);
        return `<span class="comida-ing-pill${esNuevo ? ' nuevo' : ''}${esAlergia ? ' alergia' : ''}"><img class="alimento-thumb-sm" src="${alimentoSvgDataUri(item)}" alt=""> ${escapeHtml(item.nombre)}${esNuevo ? ' ✨' : ''}${esAlergia ? ' 🚨' : ''}</span>`;
      }).filter(Boolean);

      const pillsAlinos = (p.alinos || []).map((alId) => {
        const item = ctx.catalogoMap.get(alId) || { id: alId, nombre: alId, grupo: 'alino' };
        const esAlergia = (p.reacciones || []).includes(alId);
        return `<span class="comida-ing-pill alino${esAlergia ? ' alergia' : ''}" title="Aliño opcional"><img class="alimento-thumb-sm" src="${alimentoSvgDataUri(item)}" alt=""> 🧂 ${escapeHtml(item.nombre)}${esAlergia ? ' 🚨' : ''}</span>`;
      });

      const pills = [...pillsPrincipales, ...pillsAlinos].join('');

      const alergiaBadge = (p.reacciones || []).length
        ? `<span class="plato-slot-tag alergia" style="margin-left:4px;">🚨 Alergia (${p.reacciones.length})</span>`
        : '';

      return `<tr>
        <td class="comida-hist-row" data-comida-id="${p.id}" style="cursor:pointer;"><strong>${escapeHtml((p.hora || '12:00').slice(0, 5))}</strong><br><small style="color:var(--text-2);">${escapeHtml(p.tiempo)}</small></td>
        <td class="comida-hist-row" data-comida-id="${p.id}" style="cursor:pointer;"><div class="comida-ing-mini">${pills || '—'}${alergiaBadge}</div></td>
        <td><div class="acciones-cell"><button type="button" class="comida-hist-btn" data-comida-id="${p.id}" title="Ver detalle y alergias">👁️ Ver</button><button type="button" class="del-btn" data-tabla="bitacora" data-id="${p.id}" aria-label="Eliminar">🗑</button></div></td>
      </tr>`;
    },
    (rows) => `${rows.length} plato${rows.length > 1 ? 's' : ''}`,
    (rows) => `${rows.length} plato${rows.length > 1 ? 's' : ''}`
  );
}

function sugerirPlatoDelDia() {
  const fechaSel = $('comidaFecha')?.value || dayKey(new Date());
  const ctx = calcularContextoComidas(fechaSel);
  const nuevoDraft = { verdura: null, fruta: null, proteina: null, grasa: null, cereal: null };
  let yaPusoNuevo = ctx.yaHayNuevoHoy;

  for (const g of GRUPOS_COMIDA) {
    const bloqueados = ctx.bloqueadosPorGrupo[g.key] || new Set();
    const candidatos = ctx.alimentosPrincipales.filter((a) => a.grupo === g.key && !ctx.alergiasMap.has(a.id) && !bloqueados.has(a.id));
    const nuevos = candidatos.filter((a) => !ctx.probadosHistoricos.has(a.id));
    const probados = candidatos.filter((a) => ctx.probadosHistoricos.has(a.id));

    if (!yaPusoNuevo && g.key === ctx.grupoSugerido.key && nuevos.length > 0) {
      nuevoDraft[g.key] = nuevos[0].id;
      yaPusoNuevo = true;
    } else if (probados.length > 0) {
      // Priorizar los que no se han usado esta semana todavía para variar cada día
      const noUsadosEstaSem = probados.filter((a) => !ctx.usadosEstaSemana.has(a.id));
      const pool = noUsadosEstaSem.length > 0 ? noUsadosEstaSem : probados;
      nuevoDraft[g.key] = pool[Math.floor(Math.random() * pool.length)].id;
    } else if (!yaPusoNuevo && nuevos.length > 0) {
      nuevoDraft[g.key] = nuevos[0].id;
      yaPusoNuevo = true;
    }
  }

  comidaDraftPlato = nuevoDraft;
  comidaGrupoActivo = null;
  renderComidas();
  toast('Plato sugerido según ciclo semanal ✓');
}

function abrirComidaModal(id) {
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  const plato = ctx.platos.find((p) => String(p.id) === String(id));
  if (!plato) return;
  comidaModalId = plato.id;

  $('comidaModalTitulo').textContent = `🍽️ ${plato.tiempo} — ${fmtDayLabel(plato.fecha)}`;
  $('comidaModalMeta').innerHTML = `
    <strong>Fecha:</strong> ${plato.fecha} · <strong>Hora:</strong> ${(plato.hora || '12:00').slice(0, 5)}
    ${plato.notas ? `<br><strong>Notas:</strong> ${escapeHtml(plato.notas)}` : ''}
  `;

  const ingRows = [];
  const checkRows = [];

  for (const g of GRUPOS_COMIDA) {
    const foodId = plato.ingredientes?.[g.key];
    if (!foodId) continue;
    const item = ctx.catalogoMap.get(foodId) || { id: foodId, nombre: foodId, grupo: g.key };
    const esNuevo = plato.alimentoNuevo === foodId;
    const marcadoAlergia = (plato.reacciones || []).includes(foodId);

    ingRows.push(`
      <div class="comida-modal-row">
        <div class="comida-modal-row-left">
          <img class="alimento-thumb" src="${alimentoSvgDataUri(item)}" alt="${escapeHtml(item.nombre)}">
          <div>
            <strong style="font-size:0.88rem; display:block;">${escapeHtml(item.nombre)}</strong>
            <small style="color:var(--text-2);">${g.icono} ${g.nombre}</small>
          </div>
        </div>
        ${esNuevo ? '<span class="plato-slot-tag nuevo">✨ Alimento nuevo</span>' : '<span class="plato-slot-tag" style="background:var(--surface); color:var(--text-2);">✓ Integrado</span>'}
      </div>
    `);

    checkRows.push(`
      <label class="alergia-check-item">
        <span style="display:flex; align-items:center; gap:8px;">
          <img class="alimento-thumb-sm" src="${alimentoSvgDataUri(item)}" alt="">
          <span><strong>${escapeHtml(item.nombre)}</strong> <small style="color:var(--muted);">(${g.nombre})</small></span>
        </span>
        <input type="checkbox" class="alergia-food-chk" value="${escapeHtml(foodId)}" ${marcadoAlergia ? 'checked' : ''}>
      </label>
    `);
  }

  for (const alinoId of (plato.alinos || [])) {
    if (!alinoId) continue;
    const item = ctx.catalogoMap.get(alinoId) || { id: alinoId, nombre: alinoId, grupo: 'alino' };
    const marcadoAlergia = (plato.reacciones || []).includes(alinoId);

    ingRows.push(`
      <div class="comida-modal-row">
        <div class="comida-modal-row-left">
          <img class="alimento-thumb" src="${alimentoSvgDataUri(item)}" alt="${escapeHtml(item.nombre)}">
          <div>
            <strong style="font-size:0.88rem; display:block;">${escapeHtml(item.nombre)}</strong>
            <small style="color:var(--text-2);">🧂 Aliño (opcional)</small>
          </div>
        </div>
        <span class="plato-slot-tag" style="background:var(--surface); color:var(--text-2);">🧂 Opcional</span>
      </div>
    `);

    checkRows.push(`
      <label class="alergia-check-item">
        <span style="display:flex; align-items:center; gap:8px;">
          <img class="alimento-thumb-sm" src="${alimentoSvgDataUri(item)}" alt="">
          <span><strong>${escapeHtml(item.nombre)}</strong> <small style="color:var(--muted);">(Aliño)</small></span>
        </span>
        <input type="checkbox" class="alergia-food-chk" value="${escapeHtml(alinoId)}" ${marcadoAlergia ? 'checked' : ''}>
      </label>
    `);
  }

  $('comidaModalIngredientes').innerHTML = ingRows.length ? ingRows.join('') : '<p class="empty-msg">Sin ingredientes</p>';
  $('comidaModalAlergiaChecks').innerHTML = checkRows.length ? checkRows.join('') : '<p class="empty-msg">Sin ingredientes</p>';
  $('comidaModalReaccionNotas').value = plato.reaccionNotas || '';

  const sintomasSet = new Set(plato.sintomas || []);
  document.querySelectorAll('#comidaModalSintomas .sintoma-chip').forEach((chip) => {
    chip.classList.toggle('active', sintomasSet.has(chip.dataset.sintoma));
  });

  $('comidaModal').classList.remove('hidden');
}

// Eventos interactivos del Módulo de Comidas
$('comidaFecha')?.addEventListener('change', () => renderComidas());
$('btnSugerirPlato')?.addEventListener('click', sugerirPlatoDelDia);
$('platoSelectorClose')?.addEventListener('click', () => {
  comidaGrupoActivo = null;
  renderComidas();
});
$('platoSelectorSearch')?.addEventListener('input', () => {
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  renderSelectorGrupoComida(ctx);
});

$('platoVisualSlots')?.addEventListener('click', (e) => {
  const slot = e.target.closest('.plato-slot');
  if (!slot) return;
  const g = slot.dataset.grupo;
  comidaGrupoActivo = comidaGrupoActivo === g ? null : g;
  if ($('platoSelectorSearch')) $('platoSelectorSearch').value = '';
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  renderPlatoVisualSlots(ctx);
  renderSelectorGrupoComida(ctx);
});

$('platoSelectorOpciones')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.alimento-item');
  if (!btn || btn.disabled || !comidaGrupoActivo) return;
  const alId = btn.dataset.pickAlimento;
  comidaDraftPlato[comidaGrupoActivo] = alId || null;
  comidaGrupoActivo = null;
  renderComidas();
});

$('platoAlinosGrid')?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-alino-id]');
  if (!chip) return;
  const id = chip.dataset.alinoId;
  const idx = comidaDraftAlinos.indexOf(id);
  if (idx >= 0) comidaDraftAlinos.splice(idx, 1);
  else comidaDraftAlinos.push(id);
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  renderAlinosSelector(ctx);
});

$('btnLimpiarAlinos')?.addEventListener('click', () => {
  comidaDraftAlinos = [];
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  renderAlinosSelector(ctx);
});

$('comidaCatalogoFiltro')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip-filter');
  if (!btn) return;
  comidaCatalogoFiltroGrupo = btn.dataset.catGrupo || 'todos';
  const ctx = calcularContextoComidas($('comidaFecha')?.value || dayKey(new Date()));
  renderCatalogoComidas(ctx);
});

$('comidaCatalogoGrid')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-toggle-cat]');
  if (!btn || btn.disabled) return;
  const alId = btn.dataset.toggleCat;
  btn.disabled = true;
  try {
    const custom = leerComidaCustom();
    const idx = custom.manualProbados.indexOf(alId);
    if (idx >= 0) {
      custom.manualProbados.splice(idx, 1);
      toast('Desmarcado de integrados manualmente');
    } else {
      custom.manualProbados.push(alId);
      toast('Marcado como ya integrado ✓');
    }
    await guardarComidaCustom(custom);
    renderComidas();
  } finally {
    btn.disabled = false;
  }
});

$('btnAgregarAlimentoCat')?.addEventListener('click', async () => {
  const nombre = ($('nuevoAlimNombre')?.value || '').trim();
  const grupo = $('nuevoAlimGrupo')?.value || 'verdura';
  if (!nombre) { toast('Escribe el nombre del alimento', true); return; }
  const btn = $('btnAgregarAlimentoCat');
  btn.disabled = true;
  try {
    const id = 'custom_' + nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
    const custom = leerComidaCustom();
    if (obtenerCatalogoAlimentos().some((a) => a.id === id || (a.nombreBase || a.nombre).toLowerCase() === nombre.toLowerCase())) {
      toast('Ese alimento ya existe en el catálogo', true);
      return;
    }
    const itemNuevo = normalizarItemAlimento({
      id,
      nombre,
      grupo,
      forma: grupo === 'alino' ? 'hierba' : 'custom',
      fibra: Boolean($('nuevoAlimFibra')?.checked),
      calcio: Boolean($('nuevoAlimCalcio')?.checked),
      hierro: Boolean($('nuevoAlimHierro')?.checked),
      alergeno: Boolean($('nuevoAlimAlergeno')?.checked),
      opcional: grupo === 'alino',
    });
    custom.customFoods.push(itemNuevo);
    await guardarComidaCustom(custom);
    $('nuevoAlimNombre').value = '';
    if ($('nuevoAlimFibra')) $('nuevoAlimFibra').checked = false;
    if ($('nuevoAlimCalcio')) $('nuevoAlimCalcio').checked = false;
    if ($('nuevoAlimHierro')) $('nuevoAlimHierro').checked = false;
    if ($('nuevoAlimAlergeno')) $('nuevoAlimAlergeno').checked = false;
    toast(`"${itemNuevo.nombre}" agregado al catálogo ✓`);
    renderComidas();
  } finally {
    btn.disabled = false;
  }
});

$('formComidaPlato')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = $('comidaFecha').value || dayKey(new Date());
  const hora = $('comidaHora').value || fmtTime(new Date());
  const tiempo = $('comidaTiempo').value || 'Almuerzo';
  const notas = ($('comidaNotas').value || '').trim();
  const seleccion = Object.values(comidaDraftPlato).filter(Boolean);
  if (!seleccion.length) { toast('Agrega al menos 1 alimento al plato', true); return; }

  const ctx = calcularContextoComidas(fecha);
  const nuevosEnPlato = Object.entries(comidaDraftPlato)
    .filter(([, id]) => id && !ctx.probadosHistoricos.has(id));

  if (ctx.yaHayNuevoHoy && nuevosEnPlato.length > 0) {
    toast('Regla clave: Ya probó 1 alimento nuevo hoy. Usa ingredientes ya integrados.', true);
    return;
  }
  if (nuevosEnPlato.length > 1) {
    toast('Regla clave: Nunca 2 alimentos nuevos el mismo día.', true);
    return;
  }

  const submitBtn = $('btnGuardarPlato') || e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const payloadPlato = {
      fecha,
      hora,
      tiempo,
      ingredientes: { ...comidaDraftPlato },
      alinos: [...comidaDraftAlinos],
      alimentoNuevo: nuevosEnPlato[0]?.[1] || null,
      alimentoNuevoGrupo: nuevosEnPlato[0]?.[0] || null,
      reacciones: [],
      sintomas: [],
      reaccionNotas: '',
      notas,
    };
    const ok = await insertar('bitacora', {
      titulo: SYSTEM_COMIDA_PLATO,
      fecha,
      notas: JSON.stringify(payloadPlato),
    });
    if (ok) {
      comidaDraftPlato = { verdura: null, fruta: null, proteina: null, grasa: null, cereal: null };
      comidaDraftAlinos = [];
      comidaGrupoActivo = null;
      $('comidaNotas').value = '';
      renderComidas();
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.del-btn');
  if (delBtn) return;
  const histTarget = e.target.closest('[data-comida-id]');
  if (histTarget && histTarget.dataset.comidaId) {
    abrirComidaModal(histTarget.dataset.comidaId);
  }
});

$('comidaModalClose')?.addEventListener('click', () => $('comidaModal').classList.add('hidden'));
$('comidaModal')?.addEventListener('click', (e) => { if (e.target === $('comidaModal')) $('comidaModal').classList.add('hidden'); });

$('comidaModalSintomas')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.sintoma-chip');
  if (chip) chip.classList.toggle('active');
});

$('comidaModalGuardar')?.addEventListener('click', async () => {
  const reg = (cache.bitacora || []).find((r) => String(r.id) === String(comidaModalId));
  if (!reg) return;
  const btn = $('comidaModalGuardar');
  btn.disabled = true;
  try {
    const plato = JSON.parse(reg.notas || '{}');
    const reacciones = Array.from(document.querySelectorAll('.alergia-food-chk:checked')).map((chk) => chk.value);
    const sintomas = Array.from(document.querySelectorAll('#comidaModalSintomas .sintoma-chip.active')).map((c) => c.dataset.sintoma);
    const reaccionNotas = ($('comidaModalReaccionNotas').value || '').trim();

    plato.reacciones = reacciones;
    plato.sintomas = sintomas;
    plato.reaccionNotas = reaccionNotas;

    const { error } = await db.from('bitacora').update({ notas: JSON.stringify(plato) }).eq('id', reg.id);
    if (error) { toast(`Error: ${error.message}`, true); return; }

    // Sincronizar alergias detectadas en ficha clínica del bebé si se agregaron nuevas
    if (reacciones.length > 0 && bebe) {
      const catMap = new Map(obtenerCatalogoAlimentos().map((a) => [a.id, a.nombre]));
      const nombresReacc = reacciones.map((id) => catMap.get(id) || id);
      const actual = (bebe.alergias || '').trim();
      const faltantes = nombresReacc.filter((n) => !actual.toLowerCase().includes(n.toLowerCase()));
      if (faltantes.length > 0) {
        const nuevoTxt = actual ? `${actual}, ${faltantes.join(', ')}` : faltantes.join(', ');
        await db.from('bebes').update({ alergias: nuevoTxt }).eq('id', bebe.id);
        bebe.alergias = nuevoTxt;
      }
    }

    await loadData('bitacora');
    $('comidaModal').classList.add('hidden');
    toast('Evaluación de alergias guardada ✓');
    renderComidas();
  } finally {
    btn.disabled = false;
  }
});

$('comidaModalEliminar')?.addEventListener('click', async () => {
  if (!comidaModalId) return;
  $('comidaModal').classList.add('hidden');
  await eliminar('bitacora', comidaModalId);
});

function renderAlertas() {
  if (typeof evaluarAlertasRutina !== 'function') return;
  const res = evaluarAlertasRutina(cache);
  window.conteoAlertasActivas = res.conteoActivas;

  const globalBadge = $('alertasBadgeGlobal');
  if (globalBadge) {
    if (res.conteoActivas === 0) {
      globalBadge.textContent = '🟢 Todo al día';
      globalBadge.style.background = 'rgba(25, 158, 112, 0.2)';
      globalBadge.style.color = '#199e70';
    } else {
      globalBadge.textContent = `🚨 ${res.conteoActivas} alerta${res.conteoActivas > 1 ? 's' : ''} activa${res.conteoActivas > 1 ? 's' : ''}`;
      globalBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      globalBadge.style.color = '#ef4444';
    }
  }

  // 1. Hambre
  const cardHambre = $('cardAlertaHambre');
  const txtHambre = $('txtAlertaHambre');
  const badgeHambre = $('badgeAlertaHambre');
  if (cardHambre && txtHambre && badgeHambre) {
    txtHambre.textContent = res.hambre.mensaje;
    if (res.hambre.activa) {
      cardHambre.style.borderLeftColor = '#ef4444';
      badgeHambre.textContent = res.hambre.durmiendo ? '⚠️ >8h Durmiendo' : '⚠️ Alerta';
      badgeHambre.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeHambre.style.color = '#ef4444';
    } else if (res.hambre.durmiendo) {
      cardHambre.style.borderLeftColor = '#9085e9';
      badgeHambre.textContent = 'Durmiendo 💤';
      badgeHambre.style.background = 'rgba(144, 133, 233, 0.15)';
      badgeHambre.style.color = '#9085e9';
    } else {
      cardHambre.style.borderLeftColor = '#199e70';
      badgeHambre.textContent = 'Normal';
      badgeHambre.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeHambre.style.color = '#199e70';
    }
  }

  // Hierro (08:00 hrs)
  const cardHierro = $('cardAlertaHierro');
  const txtHierro = $('txtAlertaHierro');
  const badgeHierro = $('badgeAlertaHierro');
  if (cardHierro && txtHierro && badgeHierro && res.hierro) {
    txtHierro.textContent = res.hierro.mensaje;
    if (res.hierro.activa) {
      cardHierro.style.borderLeftColor = '#ef4444';
      badgeHierro.textContent = '⚠️ Alerta';
      badgeHierro.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeHierro.style.color = '#ef4444';
    } else {
      cardHierro.style.borderLeftColor = '#199e70';
      badgeHierro.textContent = res.hierro.tomadoHoy ? 'Al día ✓' : 'Programado 08:00';
      badgeHierro.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeHierro.style.color = '#199e70';
    }
  }

  // B12 (17:30 hrs)
  const cardB12 = $('cardAlertaB12');
  const txtB12 = $('txtAlertaB12');
  const badgeB12 = $('badgeAlertaB12');
  if (cardB12 && txtB12 && badgeB12 && res.b12) {
    txtB12.textContent = res.b12.mensaje;
    if (res.b12.activa) {
      cardB12.style.borderLeftColor = '#ef4444';
      badgeB12.textContent = '⚠️ Alerta';
      badgeB12.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeB12.style.color = '#ef4444';
    } else {
      cardB12.style.borderLeftColor = '#199e70';
      badgeB12.textContent = res.b12.tomadoHoy ? 'Al día ✓' : 'Programado 17:30';
      badgeB12.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeB12.style.color = '#199e70';
    }
  }

  // 2. Vitaminas (20:15 hrs)
  const cardVits = $('cardAlertaVitaminas');
  const txtVits = $('txtAlertaVitaminas');
  const badgeVits = $('badgeAlertaVitaminas');
  if (cardVits && txtVits && badgeVits) {
    txtVits.textContent = res.vitaminas.mensaje;
    if (res.vitaminas.activa) {
      cardVits.style.borderLeftColor = '#ef4444';
      badgeVits.textContent = '⚠️ Alerta';
      badgeVits.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeVits.style.color = '#ef4444';
    } else {
      cardVits.style.borderLeftColor = '#199e70';
      badgeVits.textContent = res.vitaminas.tomadaHoy ? 'Al día ✓' : 'Programado 20:15';
      badgeVits.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeVits.style.color = '#199e70';
    }
  }

  // 3. Fecas
  const cardFecas = $('cardAlertaFecas');
  const txtFecas = $('txtAlertaFecas');
  const badgeFecas = $('badgeAlertaFecas');
  if (cardFecas && txtFecas && badgeFecas) {
    txtFecas.textContent = res.fecas.mensaje;
    if (res.fecas.activa) {
      cardFecas.style.borderLeftColor = '#ef4444';
      badgeFecas.textContent = '🚨 Alerta';
      badgeFecas.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeFecas.style.color = '#ef4444';
    } else {
      cardFecas.style.borderLeftColor = '#199e70';
      badgeFecas.textContent = 'Normal';
      badgeFecas.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeFecas.style.color = '#199e70';
    }
  }

  // 4. Sueño
  const cardSueno = $('cardAlertaSueno');
  const txtSueno = $('txtAlertaSueno');
  const badgeSueno = $('badgeAlertaSueno');
  if (cardSueno && txtSueno && badgeSueno) {
    txtSueno.textContent = res.sueno.mensaje;
    if (res.sueno.activa) {
      cardSueno.style.borderLeftColor = '#ef4444';
      badgeSueno.textContent = '⚠️ Alerta';
      badgeSueno.style.background = 'rgba(239, 68, 68, 0.2)';
      badgeSueno.style.color = '#ef4444';
    } else {
      cardSueno.style.borderLeftColor = '#199e70';
      badgeSueno.textContent = res.sueno.durmiendo ? 'Durmiendo' : 'Normal';
      badgeSueno.style.background = 'rgba(25, 158, 112, 0.15)';
      badgeSueno.style.color = '#199e70';
    }
  }

  // 5. Pañal
  const cardPanal = $('cardAlertaPanal');
  const txtPanal = $('txtAlertaPanal');
  const badgePanal = $('badgeAlertaPanal');
  if (cardPanal && txtPanal && badgePanal) {
    txtPanal.textContent = res.panal.mensaje;
    if (res.panal.activa) {
      cardPanal.style.borderLeftColor = '#ef4444';
      badgePanal.textContent = '⚠️ Alerta';
      badgePanal.style.background = 'rgba(239, 68, 68, 0.2)';
      badgePanal.style.color = '#ef4444';
    } else {
      cardPanal.style.borderLeftColor = '#199e70';
      badgePanal.textContent = 'Normal';
      badgePanal.style.background = 'rgba(25, 158, 112, 0.15)';
      badgePanal.style.color = '#199e70';
    }
  }

  // 6. Card del Informe Diario (23:00 hrs)
  const cardInforme = $('cardInformeDiario');
  const txtInforme = $('txtInformeDiarioResumen');
  const badgeInforme = $('badgeInformeDiario');
  const compTexto = $('compInformeDiarioTexto');

  if (cardInforme && txtInforme && badgeInforme && typeof generarDatosInformeDiario === 'function') {
    const info = generarDatosInformeDiario(cache, new Date());
    const desgloseP = info.panalesHoy > 0
      ? ` (${info.orinaHoy > 0 ? `${info.orinaHoy} pipí` : ''}${info.orinaHoy > 0 && info.hecesHoy > 0 ? ', ' : ''}${info.hecesHoy > 0 ? `${info.hecesHoy} caca` : ''})`
      : '';
    const palV = info.panalesHoy === 1 ? 'vez' : 'veces';

    txtInforme.textContent = `🍼 ${info.lecheHoy} ml · 🧷 ${info.panalesHoy} ${palV}${desgloseP} · 😴 ${fmtDur(info.minsSuenoHoy)} · 💊 ${info.vitaminasTomadas ? 'Vitaminas ✓' : 'Vitaminas pendientes'}`;

    if (compTexto) {
      compTexto.innerHTML = `<div>${info.compLeche}</div><div style="margin-top:2px;">${info.compSueno}</div><div style="margin-top:2px;">${info.compPanales}</div>`;
    }

    // Comprobar si ya fue enviado hoy
    const nowD = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hoyK = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;
    let rawTs = {};
    try { rawTs = JSON.parse(localStorage.getItem('nebu_alert_timestamps') || '{}'); } catch {}
    const wspCfg = typeof getWhatsAppConfig === 'function' ? getWhatsAppConfig(bebe) : {};
    const enviado = rawTs.informe_diario === hoyK || wspCfg.ultimoInformeFecha === hoyK;

    if (enviado) {
      badgeInforme.textContent = 'Enviado hoy ✓';
      badgeInforme.style.background = 'rgba(25, 158, 112, 0.2)';
      badgeInforme.style.color = '#199e70';
      cardInforme.style.borderLeftColor = '#199e70';
    } else {
      badgeInforme.textContent = 'Programado 23:00';
      badgeInforme.style.background = 'rgba(57, 135, 229, 0.2)';
      badgeInforme.style.color = '#3987e5';
      cardInforme.style.borderLeftColor = '#3987e5';
    }
  }
}

async function actualizarAlertasYBadge() {
  if (typeof evaluarAlertasRutina === 'function') {
    const res = evaluarAlertasRutina(cache);
    window.conteoAlertasActivas = res.conteoActivas;
  }
  renderTabbar();
  if (currentTab === 'alertas') {
    renderAlertas();
  }
  if (typeof verificarYDespacharAlertasWhatsApp === 'function' && bebe) {
    await verificarYDespacharAlertasWhatsApp(cache, { bebe, miRol, dbClient: db });
  }
}

function renderTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  const el = $('tab-' + tab);
  if (el) el.classList.add('active');

  // Metatítulo dinámico y semántico para SEO/PWA
  const tabName = TABS[tab]?.label || 'Rutinas';
  document.title = `${tabName} | Rutinas del Bebé`;

  if (tab === 'stats') { if (statsDirty) renderCharts(); }
  else if (tab === 'alertas') renderAlertas();
  else if (tab === 'leche') renderLeche();
  else if (tab === 'comidas') renderComidas();
  else if (tab === 'vitaminas') renderVitaminas();
  else if (tab === 'panales') renderPanales();
  else if (tab === 'sueno') renderSueno();
  else if (tab === 'info') renderInfoBebe();
  else if (tab === 'bitacora') renderBitacora();
  else if (tab === 'juegos') renderJuegos();
}

function activarTab(tab) {
  currentTab = tab;
  localStorage.setItem('tab', tab);
  renderTabbar();
  renderTab(tab);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('.tab-btn:not(#tabMasBtn)');
  if (b?.dataset?.tab) {
    activarTab(b.dataset.tab);
    $('tabMenu')?.classList.add('hidden');
    return;
  }
  const masBtn = e.target.closest('#tabMasBtn');
  if (masBtn) {
    $('tabMenu')?.classList.toggle('hidden');
    return;
  }
  if (!e.target.closest('#tabMenu')) $('tabMenu')?.classList.add('hidden');
});

// ---------- Formularios Principales con bloqueo de botones ----------
$('formLeche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Number($('lecheCantidad').value);
  if (!v || v <= 0) { toast('Ingresa una cantidad válida', true); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const fh = $('lecheFechaHora').value ? new Date($('lecheFechaHora').value).toISOString() : new Date().toISOString();
    const ok = await insertar('tomas', { cantidad_ml: v, fecha_hora: fh });
    if (ok) { $('lecheCantidad').value = ''; setNowDefaults(); renderLeche(); }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('lecheAhora').addEventListener('click', () => { $('lecheFechaHora').value = dtLocal(new Date()); });

$('formVitaminas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Number($('vitGotas').value);
  if (!v || v <= 0) { toast('Ingresa una cantidad válida', true); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const ok = await insertar('vitaminas', { gotas: v, fecha_hora: toISO($('vitFecha').value, $('vitHora').value) });
    if (ok) { setNowDefaults(); renderVitaminas(); }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('formVitaminaTipo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('vitTipoNombre').value.trim();
  if (!nombre) return;
  const gotas = Number($('vitTipoGotas').value) || 5;
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const ok = await insertar('vitaminas_tipos', { nombre, gotas_default: gotas });
    if (ok) { $('vitTipoNombre').value = ''; $('vitTipoGotas').value = '5'; renderVitaminaTipos(); }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('panHeces').addEventListener('change', actualizarVisibilidadBristolForm);
$('panFechaHora').addEventListener('change', actualizarVisibilidadBristolForm);

$('formPanales').addEventListener('submit', async (e) => {
  e.preventDefault();
  const h = $('panHeces').checked, o = $('panOrina').checked;
  if (!h && !o) { toast('Marca al menos heces u orina', true); return; }
  const fhVal = $('panFechaHora').value;
  const fh = fhVal ? new Date(fhVal).toISOString() : new Date().toISOString();
  const requiereBristol = h && aplicaBristol(fh);
  if (requiereBristol && !selectedBristol) {
    toast('Selecciona el tipo en la Escala de Bristol (1 al 7)', true);
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const bristolElegido = requiereBristol ? selectedBristol : null;
    const ok = await insertar('panales', { heces: h, orina: o, fecha_hora: fh });
    if (ok) {
      if (bristolElegido) {
        const targetMs = new Date(fh).getTime();
        const nuevoReg = (cache.panales || []).find((r) => Math.abs(new Date(r.fecha_hora).getTime() - targetMs) < 3000 && r.heces);
        if (nuevoReg?.id) {
          await guardarBristolEnMapa(nuevoReg.id, bristolElegido);
        }
      }
      $('panHeces').checked = false;
      $('panOrina').checked = false;
      selectedBristol = null;
      setNowDefaults();
      renderPanales();
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('panAhora').addEventListener('click', () => {
  $('panFechaHora').value = dtLocal(new Date());
  actualizarVisibilidadBristolForm();
});

$('formSueno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('suenoFecha').value, ini = $('suenoInicio').value, fin = $('suenoFin').value;
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const dtIni = new Date(`${f}T${ini}`);
    let dtFin = new Date(`${f}T${fin}`);
    if (dtFin <= dtIni) dtFin = new Date(dtFin.getTime() + 86400000);
    const ok = await insertar('sueno', { inicio: dtIni.toISOString(), fin: dtFin.toISOString() });
    if (ok) { setNowDefaults(); renderSueno(); }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

$('objetivoInput').addEventListener('change', () => {
  const v = Number($('objetivoInput').value);
  if (v > 0) { localStorage.setItem('objetivo_leche', v); renderLecheResumen(); }
});

$('lataInput').addEventListener('change', async () => {
  const v = Number($('lataInput').value);
  await actualizarBebe({ lata_gramos: v > 0 ? v : 800 });
});

$('abrirLataBtn').addEventListener('click', async () => {
  if ($('abrirLataBtn').disabled) return;
  $('abrirLataBtn').disabled = true;
  try {
    const val = $('lataAbiertaInput').value;
    const fecha = val ? new Date(val) : new Date();
    const ok = await actualizarBebe({ lata_abierta_en: fecha.toISOString(), latas_usadas: (bebe?.latas_usadas || 0) + 1 });
    if (ok) toast('🥫 Nueva lata registrada');
  } finally {
    $('abrirLataBtn').disabled = false;
  }
});

// ---------- Bitácora ----------
function renderBitacora() {
  if (!$('bitFecha').value) $('bitFecha').value = dayKey(new Date());
  const rowsVisibles = (cache.bitacora || []).filter((r) => !r.titulo?.startsWith('__'));
  $('bitLista').innerHTML = historialColapsable(rowsVisibles, (r) => r.fecha, (r) => `
      <div class="bit-item">
        <div class="bit-head"><strong>${escapeHtml(r.titulo)}</strong></div>
        ${r.notas ? `<p>${escapeHtml(r.notas)}</p>` : ''}
        <div class="bit-acciones">${botonesEdit('bitacora', r.id)}</div>
      </div>`);
}

$('formBitacora').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = $('bitTitulo').value.trim();
  if (!titulo) { toast('Escribe un título', true); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]') || e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const ok = await insertar('bitacora', {
      titulo,
      fecha: $('bitFecha').value || dayKey(new Date()),
      notas: $('bitNotas').value.trim() || null,
    });
    if (ok) { $('bitTitulo').value = ''; $('bitNotas').value = ''; $('bitFecha').value = dayKey(new Date()); renderBitacora(); }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ---------- Juegos y Estimulación ----------
let juegoEditId = null;
let juegoFotos = [];
let juegoRAF = null, juegoT0 = 0, juegoSeg = 0;

const fmtCrono = (seg) => `${pad2(Math.floor(seg / 60))}:${pad2(seg % 60)}`;

function redimensionarFoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        const escala = Math.min(1, 256 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * escala);
        c.height = Math.round(im.height * escala);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = reject;
      im.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const pintarCrono = () => { $('juegoCrono').textContent = fmtCrono(juegoSeg); };
function detenerCrono() { clearInterval(juegoRAF); juegoRAF = null; $('juegoStart').textContent = '▶️ Iniciar'; }

function guardarCronoLS() {
  if (juegoRAF) localStorage.setItem('juego_crono', JSON.stringify({ running: true, t0: juegoT0 }));
  else if (juegoSeg > 0) localStorage.setItem('juego_crono', JSON.stringify({ running: false, seg: juegoSeg }));
  else localStorage.removeItem('juego_crono');
}

function restaurarCrono() {
  let s; try { s = JSON.parse(localStorage.getItem('juego_crono') || 'null'); } catch { s = null; }
  if (!s) return;
  if (s.running) {
    juegoT0 = s.t0;
    juegoRAF = setInterval(() => { juegoSeg = Math.floor((Date.now() - juegoT0) / 1000); pintarCrono(); }, 1000);
    $('juegoStart').textContent = '⏸️ Pausar';
  } else {
    juegoSeg = s.seg || 0;
  }
  pintarCrono();
}

$('juegoStart').addEventListener('click', () => {
  if (juegoRAF) { detenerCrono(); guardarCronoLS(); return; }
  juegoT0 = Date.now() - juegoSeg * 1000;
  juegoRAF = setInterval(() => { juegoSeg = Math.floor((Date.now() - juegoT0) / 1000); pintarCrono(); }, 1000);
  $('juegoStart').textContent = '⏸️ Pausar';
  guardarCronoLS();
});

$('juegoReset').addEventListener('click', () => { detenerCrono(); juegoSeg = 0; pintarCrono(); guardarCronoLS(); });

function pintarFotosPrev() {
  $('juegoFotosPrev').innerHTML = juegoFotos.map((f, i) =>
    `<div class="album-item"><img src="${f}" alt="Foto de sesión de juego"><button type="button" class="album-del" data-i="${i}">✕</button></div>`
  ).join('');
}
$('juegoFotoBtn').addEventListener('click', () => $('juegoFoto').click());
$('juegoFoto').addEventListener('change', async () => {
  for (const file of $('juegoFoto').files) {
    try { juegoFotos.push(await redimensionarFoto(file)); } catch { toast('No se pudo procesar una foto', true); }
  }
  $('juegoFoto').value = '';
  pintarFotosPrev();
});
$('juegoFotosPrev').addEventListener('click', (e) => {
  const b = e.target.closest('.album-del');
  if (!b) return;
  juegoFotos.splice(Number(b.dataset.i), 1);
  pintarFotosPrev();
});

function limpiarJuegoForm() {
  juegoEditId = null;
  $('juegoSubmit').textContent = 'Guardar juego';
  $('juegoNombre').value = '';
  $('juegoObs').value = '';
  juegoFotos = [];
  pintarFotosPrev();
  detenerCrono();
  juegoSeg = 0; pintarCrono();
  guardarCronoLS();
}

function renderJuegos() {
  $('juegoLista').innerHTML = historialColapsable(cache.juegos || [], (r) => dayKey(new Date(r.fecha)), (r) => `
      <div class="bit-item">
        <div class="bit-head"><strong>${escapeHtml(r.nombre || 'Juego')}</strong><span>${new Date(r.fecha).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>
        ${r.duracion_seg ? `<p class="ctrl-detalle">⏱️ ${fmtCrono(r.duracion_seg)}</p>` : ''}
        ${r.observaciones ? `<p>${escapeHtml(r.observaciones)}</p>` : ''}
        ${(Array.isArray(r.fotos) && r.fotos.length) ? `<div class="album">${r.fotos.map((f) => `<div class="album-item"><img src="${f}" alt="Foto adjunta de juego"></div>`).join('')}</div>` : ''}
        <div class="bit-acciones">${botonesEdit('juegos', r.id)}</div>
      </div>`);
}

function cargarJuego(id) {
  const r = (cache.juegos || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  juegoEditId = r.id;
  $('juegoSubmit').textContent = 'Actualizar juego';
  $('juegoNombre').value = r.nombre || '';
  $('juegoObs').value = r.observaciones || '';
  juegoFotos = Array.isArray(r.fotos) ? r.fotos.slice() : [];
  pintarFotosPrev();
  detenerCrono();
  juegoSeg = r.duracion_seg || 0; pintarCrono();
  guardarCronoLS();
  $('formJuegos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('formJuegos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('juegoNombre').value.trim();
  if (!nombre) { toast('Escribe el nombre del juego', true); return; }
  const submitBtn = $('juegoSubmit') || e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    detenerCrono();
    const valores = {
      nombre,
      duracion_seg: juegoSeg || null,
      observaciones: $('juegoObs').value.trim() || null,
      fotos: juegoFotos,
    };
    if (juegoEditId) {
      const { error } = await db.from('juegos').update(valores).eq('id', juegoEditId);
      if (error) { toast(`Error: ${error.message}`, true); return; }
      await loadData('juegos');
      toast('Juego actualizado ✓');
    } else {
      valores.fecha = new Date().toISOString();
      const ok = await insertar('juegos', valores);
      if (!ok) return;
    }
    limpiarJuegoForm();
    renderJuegos();
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

let editBristolVal = null;

function refrescarBristolModalEdicion() {
  const wrap = $('edBristolWrap');
  if (!wrap) return;
  const f = $('edPanFecha')?.value || '';
  const h = $('edPanHeces')?.checked;
  const mostrar = Boolean(h && f >= FECHA_MIN_BRISTOL);
  wrap.classList.toggle('hidden', !mostrar);
  if (mostrar) {
    renderBristolSelector($('edBristolGrid'), $('edBristolLeyenda'), editBristolVal, (v) => {
      editBristolVal = v;
    });
  } else {
    editBristolVal = null;
  }
}
let editTabla = null;
let editId = null;

const EDIT_TITULOS = {
  tomas: 'Editar toma',
  vitaminas: 'Editar vitaminas',
  vitaminas_tipos: 'Editar vitamina',
  vitaminas_tipos_log: 'Editar dosis de vitamina',
  panales: 'Editar cambio de pañal',
  sueno: 'Editar sueño',
  bitacora: 'Editar anotación',
};

function abrirEdicion(tabla, id) {
  editTabla = tabla;
  editId = id;
  const reg = (cache[tabla] || []).find((r) => String(r.id) === String(id));
  if (!reg) return;

  $('editTitulo').textContent = EDIT_TITULOS[tabla] || 'Editar registro';
  const c = $('editCampos');
  c.innerHTML = '';

  if (tabla === 'tomas') {
    const d = new Date(reg.fecha_hora);
    c.innerHTML = `
      <label>Cantidad (ml)<input type="number" id="edLecheCant" step="any" inputmode="decimal" value="${reg.cantidad_ml}" required></label>
      <div class="fila-2"><label>Fecha<input type="date" id="edLecheFecha" value="${dayKey(d)}"></label><label>Hora<input type="time" id="edLecheHora" value="${fmtTime(d)}"></label></div>`;
  } else if (tabla === 'vitaminas') {
    const d = new Date(reg.fecha_hora);
    c.innerHTML = `
      <label>Gotas<input type="number" id="edVitGotas" step="any" inputmode="decimal" value="${reg.gotas}" required></label>
      <div class="fila-2"><label>Fecha<input type="date" id="edVitFecha" value="${dayKey(d)}"></label><label>Hora<input type="time" id="edVitHora" value="${fmtTime(d)}"></label></div>`;
  } else if (tabla === 'vitaminas_tipos') {
    c.innerHTML = `
      <label>Nombre<input type="text" id="edVitNombre" maxlength="60" value="${escapeHtml(reg.nombre)}" required></label>
      <label>Gotas por defecto<input type="number" id="edVitGotasDef" step="any" inputmode="decimal" value="${reg.gotas_default || 5}"></label>`;
  } else if (tabla === 'vitaminas_tipos_log') {
    c.innerHTML = `
      <div class="fila-2"><label>Fecha<input type="date" id="edVitLogFecha" value="${reg.fecha}" required></label><label>Hora<input type="time" id="edVitLogHora" value="${reg.hora ? reg.hora.slice(0, 5) : ''}"></label></div>
      <label>Gotas<input type="number" id="edVitLogGotas" step="any" inputmode="decimal" value="${reg.gotas ?? 5}"></label>`;
  } else if (tabla === 'panales') {
    const d = new Date(reg.fecha_hora);
    const fechaStr = dayKey(d);
    const mapB = leerBristolMap();
    editBristolVal = (reg.heces && fechaStr >= FECHA_MIN_BRISTOL) ? (reg.bristol || mapB[String(reg.id)] || null) : null;
    c.innerHTML = `
      <div class="check-row"><label class="check-pill"><input type="checkbox" id="edPanHeces" ${reg.heces ? 'checked' : ''}> 💩 Heces</label><label class="check-pill"><input type="checkbox" id="edPanOrina" ${reg.orina ? 'checked' : ''}> 💧 Orina</label></div>
      <div class="fila-2"><label>Fecha<input type="date" id="edPanFecha" value="${fechaStr}"></label><label>Hora<input type="time" id="edPanHora" value="${fmtTime(d)}"></label></div>
      <div id="edBristolWrap" class="bristol-wrap hidden">
        <div class="bristol-title"><span>💩 Escala de Bristol Pediátrica</span><small>Tipo (1 al 7)</small></div>
        <div id="edBristolGrid" class="bristol-grid"></div>
        <div id="edBristolLeyenda" class="bristol-leyenda hidden"></div>
      </div>`;
    $('edPanHeces').addEventListener('change', refrescarBristolModalEdicion);
    $('edPanFecha').addEventListener('change', refrescarBristolModalEdicion);
    refrescarBristolModalEdicion();
  } else if (tabla === 'sueno') {
    const dIni = new Date(reg.inicio);
    const dFin = reg.fin ? new Date(reg.fin) : null;
    c.innerHTML = `
      <label>Fecha de inicio<input type="date" id="edSuenoFecha" value="${dayKey(dIni)}"></label>
      <div class="fila-2"><label>Se durmió<input type="time" id="edSuenoIni" value="${fmtTime(dIni)}"></label><label>Despertó<input type="time" id="edSuenoFin" value="${dFin ? fmtTime(dFin) : ''}"></label></div>`;
  } else if (tabla === 'bitacora') {
    c.innerHTML = `
      <label>Título<input type="text" id="edBitTitulo" maxlength="80" value="${escapeHtml(reg.titulo)}" required></label>
      <label>Fecha<input type="date" id="edBitFecha" value="${reg.fecha}" required></label>
      <label>Anotaciones<textarea id="edBitNotas" rows="3" maxlength="1000">${escapeHtml(reg.notas || '')}</textarea></label>`;
  }
  $('editModal').classList.remove('hidden');
}

$('editClose').addEventListener('click', () => $('editModal').classList.add('hidden'));
$('editModal').addEventListener('click', (e) => { if (e.target === $('editModal')) $('editModal').classList.add('hidden'); });

$('editGuardar').addEventListener('click', async () => {
  if ($('editGuardar').disabled) return;
  $('editGuardar').disabled = true;

  try {
    let patch = null;
    if (editTabla === 'tomas') {
      patch = { cantidad_ml: Number($('edLecheCant').value), fecha_hora: toISO($('edLecheFecha').value, $('edLecheHora').value) };
    } else if (editTabla === 'vitaminas') {
      patch = { gotas: Number($('edVitGotas').value), fecha_hora: toISO($('edVitFecha').value, $('edVitHora').value) };
    } else if (editTabla === 'vitaminas_tipos') {
      patch = { nombre: $('edVitNombre').value.trim(), gotas_default: Number($('edVitGotasDef').value) || 5 };
    } else if (editTabla === 'vitaminas_tipos_log') {
      patch = { fecha: $('edVitLogFecha').value, hora: $('edVitLogHora').value ? $('edVitLogHora').value + ':00' : null, gotas: Number($('edVitLogGotas').value) || null };
    } else if (editTabla === 'panales') {
      const fPan = $('edPanFecha').value;
      const hPan = $('edPanHeces').checked;
      if (hPan && fPan >= FECHA_MIN_BRISTOL && !editBristolVal) {
        toast('Selecciona el tipo en la Escala de Bristol (1 al 7)', true);
        return;
      }
      patch = { heces: hPan, orina: $('edPanOrina').checked, fecha_hora: toISO(fPan, $('edPanHora').value) };
    } else if (editTabla === 'sueno') {
      const f = $('edSuenoFecha').value, ini = $('edSuenoIni').value, fin = $('edSuenoFin').value;
      const dIni = new Date(`${f}T${ini}`);
      let dFin = fin ? new Date(`${f}T${fin}`) : null;
      if (dFin && dFin <= dIni) dFin = new Date(dFin.getTime() + 86400000);
      patch = { inicio: dIni.toISOString(), fin: dFin ? dFin.toISOString() : null };
    } else if (editTabla === 'bitacora') {
      patch = { titulo: $('edBitTitulo').value.trim(), fecha: $('edBitFecha').value, notas: $('edBitNotas').value.trim() || null };
    }
    if (!patch) return;

    const { error } = await db.from(editTabla).update(patch).eq('id', editId);
    if (error) { toast(`Error al actualizar: ${error.message}`, true); return; }
    if (editTabla === 'panales') {
      const fPan = $('edPanFecha').value;
      const bGuardar = (patch.heces && fPan >= FECHA_MIN_BRISTOL) ? editBristolVal : null;
      await guardarBristolEnMapa(editId, bGuardar);
    }
    await loadData(editTabla);
    statsDirty = true;
    $('editModal').classList.add('hidden');
    toast('Registro actualizado ✓');
    if (typeof actualizarAlertasYBadge === 'function') {
      await actualizarAlertasYBadge();
    }
    renderTab(currentTab);
  } finally {
    $('editGuardar').disabled = false;
  }
});

// ---------- Información del Bebé y Padres ----------
function calcularEdad(fNac) {
  if (!fNac) return '';
  const nac = new Date(fNac + 'T12:00'), hoy = new Date();
  let m = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
  if (hoy.getDate() < nac.getDate()) m--;
  if (m < 1) {
    const d = Math.max(0, Math.floor((hoy - nac) / 86400000));
    return `${d} día${d === 1 ? '' : 's'}`;
  }
  const meses = m;
  return `${meses} mes${meses === 1 ? '' : 'es'}`;
}

function renderInfoBebe() {
  if (!bebe) return;
  $('infoNombre').value = bebe.nombre || '';
  $('infoNombreCompleto').value = bebe.nombre_completo || '';
  $('infoGrupo').value = bebe.grupo_sanguineo || '';
  $('infoNacimiento').value = bebe.fecha_nacimiento || '';
  $('infoPeso').value = bebe.peso_kg ?? '';
  $('infoTalla').value = bebe.talla_cm ?? '';
  $('infoAlergias').value = bebe.alergias || '';
  $('infoRutinas').value = bebe.rutinas || '';

  const edad = calcularEdad(bebe.fecha_nacimiento);
  const partes = [];
  if (edad) partes.push(edad);
  if (bebe.peso_kg) partes.push(`${bebe.peso_kg} kg`);
  if (bebe.talla_cm) partes.push(`${bebe.talla_cm} cm`);
  if (bebe.grupo_sanguineo) partes.push(`GS: ${bebe.grupo_sanguineo}`);
  $('infoResumen').textContent = partes.join(' · ');

  if (bebe.foto_base64) {
    $('infoFotoPreview').src = bebe.foto_base64;
    $('infoFotoPreview').classList.remove('hidden');
    $('infoAvatarFallback').classList.add('hidden');
  } else {
    $('infoFotoPreview').classList.add('hidden');
    $('infoAvatarFallback').classList.remove('hidden');
  }
}

$('formInfo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await actualizarBebe({
      nombre: $('infoNombre').value.trim() || 'Mi bebé',
      nombre_completo: $('infoNombreCompleto').value.trim() || null,
      grupo_sanguineo: $('infoGrupo').value || null,
      fecha_nacimiento: $('infoNacimiento').value || null,
      peso_kg: Number($('infoPeso').value) > 0 ? Number($('infoPeso').value) : null,
      talla_cm: Number($('infoTalla').value) > 0 ? Number($('infoTalla').value) : null,
      alergias: $('infoAlergias').value.trim() || null,
      rutinas: $('infoRutinas').value.trim() || null,
    });
    renderInfoBebe();
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('infoFotoBtn').addEventListener('click', () => $('infoFoto').click());
$('infoFoto').addEventListener('change', async () => {
  const file = $('infoFoto').files[0];
  if (!file) return;
  try {
    const foto_base64 = await redimensionarFoto(file);
    await actualizarBebe({ foto_base64 });
    renderInfoBebe();
  } catch {
    toast('No se pudo procesar la foto', true);
  }
});

// Modal Padre / Madre
function abrirParent(rol) {
  const m = (cache.miembros || []).find((x) => x.rol === rol);
  const propio = miRol === rol;
  $('parentTitulo').textContent = rol === 'madre' ? '👩 Madre' : '👨 Padre';
  $('parentNombre').value = m?.nombre_completo || '';
  $('parentTelefono').value = m?.telefono || '';
  $('parentCorreo').value = m?.correo_contacto || '';
  $('parentGrupo').value = m?.grupo_sanguineo || '';
  ['parentNombre', 'parentTelefono', 'parentCorreo', 'parentGrupo'].forEach((id) => { $(id).disabled = !propio; });
  $('parentGuardar').classList.toggle('hidden', !propio);
  const aviso = $('parentAviso');
  if (!m) { aviso.textContent = 'Este rol aún no está vinculado.'; aviso.classList.remove('hidden'); }
  else if (!propio) { aviso.textContent = 'Solo puedes editar tu propia información.'; aviso.classList.remove('hidden'); }
  else { aviso.classList.add('hidden'); }
  $('parentModal').classList.remove('hidden');
}

$('verMadreBtn').addEventListener('click', () => abrirParent('madre'));
$('verPadreBtn').addEventListener('click', () => abrirParent('padre'));
$('parentClose').addEventListener('click', () => $('parentModal').classList.add('hidden'));
$('parentModal').addEventListener('click', (e) => { if (e.target === $('parentModal')) $('parentModal').classList.add('hidden'); });

$('parentGuardar').addEventListener('click', async () => {
  const btn = $('parentGuardar');
  btn.disabled = true;
  try {
    const { error } = await db.from('miembros').update({
      nombre_completo: $('parentNombre').value.trim() || null,
      telefono: $('parentTelefono').value.trim() || null,
      correo_contacto: $('parentCorreo').value.trim() || null,
      grupo_sanguineo: $('parentGrupo').value || null,
    }).eq('user_id', usuario.id);
    if (error) { toast(`Error: ${error.message}`, true); return; }
    await loadData('miembros');
    $('parentModal').classList.add('hidden');
    toast('Guardado ✓');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Configuración y Sincronización del Bebé ----------
async function actualizarBebe(patch) {
  let { data, error } = await db.from('bebes').update(patch).eq('id', bebe.id).select().single();
  if (error && error.message && error.message.includes('whatsapp_config')) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.whatsapp_config;
    const res = await db.from('bebes').update(fallbackPatch).eq('id', bebe.id).select().single();
    data = res.data;
    error = res.error;
  }
  if (error) { toast(`Error: ${error.message}`, true); return false; }
  bebe = data;
  if (patch.whatsapp_config) bebe.whatsapp_config = patch.whatsapp_config;
  aplicarBebe();
  toast('Guardado ✓');
  return true;
}

function aplicarBebe() {
  if (!bebe) return;
  $('babyName').textContent = bebe.nombre || 'Mi bebé';
  const badge = $('rolBadge');
  if (miRol) {
    badge.textContent = miRol === 'madre' ? '👩 Mamá' : '👨 Papá';
    badge.classList.remove('hidden');
  } else badge.classList.add('hidden');

  const edad = calcularEdad(bebe.fecha_nacimiento);
  const partes = [];
  if (edad) partes.push(edad);
  if (bebe.peso_kg) partes.push(`${bebe.peso_kg} kg`);
  if (bebe.talla_cm) partes.push(`${bebe.talla_cm} cm`);
  const bStats = $('babyStats');
  if (partes.length) { bStats.textContent = partes.join(' · '); bStats.classList.remove('hidden'); }
  else bStats.classList.add('hidden');

  const photo = $('babyPhoto'), fallback = $('avatarFallback');
  if (bebe.foto_base64) {
    photo.src = bebe.foto_base64;
    photo.classList.remove('hidden');
    fallback.classList.add('hidden');
  } else {
    photo.classList.add('hidden');
    fallback.classList.remove('hidden');
  }
  applyPalette(bebe.paleta || 'celeste');
}

function renderOrdenTabsUI() {
  const orden = leerOrdenTabs();
  $('ordenTabsUI').innerHTML = orden.map((k, i) => `
    <div class="orden-item${i < 4 ? ' en-barra' : ''}">
      <span>${TABS[k].icon} ${TABS[k].label} ${i < 4 ? '<strong>(Barra)</strong>' : ''}</span>
      <div class="orden-btns">
        <button type="button" class="icon-btn-sm" data-move="up" data-k="${k}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="icon-btn-sm" data-move="down" data-k="${k}" ${i === orden.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
    </div>`).join('');
}

$('ordenTabsUI').addEventListener('click', (e) => {
  const b = e.target.closest('[data-move]');
  if (!b) return;
  const k = b.dataset.k, dir = b.dataset.move;
  const orden = leerOrdenTabs();
  const idx = orden.indexOf(k);
  if (idx < 0) return;
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= orden.length) return;
  orden.splice(idx, 1);
  orden.splice(target, 0, k);
  localStorage.setItem('orden_tabs', JSON.stringify(orden));
  renderOrdenTabsUI();
  renderTabbar();
});

$('settingsBtn').addEventListener('click', () => {
  if (!bebe) return;
  $('cfgCodigo').textContent = bebe.codigo || '——————';
  $('cfgNombre').value = bebe.nombre || '';
  $('cfgNacimiento').value = bebe.fecha_nacimiento || '';
  $('cfgPeso').value = bebe.peso_kg ?? '';
  $('cfgTalla').value = bebe.talla_cm ?? '';
  const rRadio = document.querySelector(`input[name="cfgRol"][value="${miRol}"]`);
  if (rRadio) rRadio.checked = true;

  const photo = $('cfgFotoPreview'), fallback = $('cfgAvatarFallback');
  if (bebe.foto_base64) { photo.src = bebe.foto_base64; photo.classList.remove('hidden'); fallback.classList.add('hidden'); }
  else { photo.classList.add('hidden'); fallback.classList.remove('hidden'); }

  document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s.dataset.palette === (bebe.paleta || 'celeste')));
  renderOrdenTabsUI();

  // Cargar configuración de WhatsApp
  const wspCfg = typeof getWhatsAppConfig === 'function' ? getWhatsAppConfig(bebe) : {};
  if ($('cfgWspEnabled')) {
    $('cfgWspEnabled').checked = !!wspCfg.enabled;
    $('cfgWspPanel').classList.toggle('hidden', !wspCfg.enabled);
    $('cfgWspTarget').value = wspCfg.target || '120363414573336812@g.us';
    $('cfgWspTomas').checked = wspCfg.notifyTomas !== false;
    $('cfgWspPanales').checked = wspCfg.notifyPanales !== false;
    $('cfgWspVitaminas').checked = wspCfg.notifyVitaminas !== false;
    $('cfgWspSueno').checked = wspCfg.notifySueno !== false;
    if ($('cfgWspAlertHambre')) $('cfgWspAlertHambre').checked = wspCfg.notifyAlertaHambre !== false;
    if ($('cfgWspAlertVits')) $('cfgWspAlertVits').checked = wspCfg.notifyAlertaVitaminas !== false;
    if ($('cfgWspAlertFecas')) $('cfgWspAlertFecas').checked = wspCfg.notifyAlertaFecas !== false;
    if ($('cfgWspAlertSueno')) $('cfgWspAlertSueno').checked = wspCfg.notifyAlertaSueno !== false;
    if ($('cfgWspAlertPanal')) $('cfgWspAlertPanal').checked = wspCfg.notifyAlertaPanal !== false;
    if ($('cfgWspInformeDiario')) $('cfgWspInformeDiario').checked = wspCfg.notifyInformeDiario !== false;
    $('cfgWspTestResult')?.classList.add('hidden');
    $('cfgWspQrContainer')?.classList.add('hidden');
    $('cfgWspGroupsBox')?.classList.add('hidden');
    actualizarBadgeEstadoWhatsApp();
    actualizarPreviewDestinatarios();
  }

  $('settingsModal').classList.remove('hidden');
});

$('settingsClose').addEventListener('click', () => {
  $('settingsModal').classList.add('hidden');
  $('cfgWspGroupsBox')?.classList.add('hidden');
  if (typeof detenerPollingWhatsApp === 'function') detenerPollingWhatsApp();
});
$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) {
    $('settingsModal').classList.add('hidden');
    $('cfgWspGroupsBox')?.classList.add('hidden');
    if (typeof detenerPollingWhatsApp === 'function') detenerPollingWhatsApp();
  }
});

$('copiarCodigo').addEventListener('click', async () => {
  if (!bebe?.codigo) return;
  try {
    await navigator.clipboard.writeText(bebe.codigo);
    toast('Código copiado al portapapeles ✓');
  } catch {
    toast(`Código: ${bebe.codigo}`);
  }
});

// Compartir código nativo / WhatsApp
$('compartirCodigoBtn')?.addEventListener('click', async () => {
  if (!bebe?.codigo) return;
  const text = `¡Hola! Únete al registro de ${bebe.nombre || 'nuestro bebé'} en NebuApp con este código: ${bebe.codigo}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Rutinas del Bebé', text }); } catch {}
  } else {
    try { await navigator.clipboard.writeText(text); toast('Mensaje copiado ✓'); } catch {}
  }
});

$('whatsappCodigoBtn')?.addEventListener('click', () => {
  if (!bebe?.codigo) return;
  const msg = `¡Hola! Únete al registro de ${bebe.nombre || 'nuestro bebé'} en NebuApp con este código: ${bebe.codigo}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
});

$('cfgFotoBtn').addEventListener('click', () => $('cfgFoto').click());
$('cfgFoto').addEventListener('change', async () => {
  const file = $('cfgFoto').files[0];
  if (!file) return;
  try {
    const base64 = await redimensionarFoto(file);
    $('cfgFotoPreview').src = base64;
    $('cfgFotoPreview').classList.remove('hidden');
    $('cfgAvatarFallback').classList.add('hidden');
    $('cfgFoto').dataset.nuevo = base64;
  } catch {
    toast('No se pudo procesar la foto', true);
  }
});

$('swatchRow').addEventListener('click', (e) => {
  const sw = e.target.closest('.swatch');
  if (!sw) return;
  document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
  sw.classList.add('selected');
});

$('cfgGuardar').addEventListener('click', async () => {
  const btn = $('cfgGuardar');
  btn.disabled = true;
  try {
    const nombre = $('cfgNombre').value.trim() || 'Mi bebé';
    const paleta = document.querySelector('.swatch.selected')?.dataset?.palette || bebe.paleta || 'celeste';
    const nuevoRol = document.querySelector('input[name="cfgRol"]:checked')?.value || miRol;
    const patch = {
      nombre,
      paleta,
      fecha_nacimiento: $('cfgNacimiento').value || null,
      peso_kg: Number($('cfgPeso').value) > 0 ? Number($('cfgPeso').value) : null,
      talla_cm: Number($('cfgTalla').value) > 0 ? Number($('cfgTalla').value) : null,
    };
    if ($('cfgFoto').dataset.nuevo) {
      patch.foto_base64 = $('cfgFoto').dataset.nuevo;
      delete $('cfgFoto').dataset.nuevo;
    }
    if (nuevoRol !== miRol) {
      const { error: eRol } = await db.from('miembros').update({ rol: nuevoRol }).eq('user_id', usuario.id);
      if (!eRol) miRol = nuevoRol;
    }

    // Guardar configuración de WhatsApp
    if ($('cfgWspEnabled')) {
      const rawTarget = $('cfgWspTarget').value.trim();
      const parsedTargets = typeof normalizarDestinatarios === 'function'
        ? normalizarDestinatarios(rawTarget).filter((t) => t.endsWith('@g.us'))
        : ['120363414573336812@g.us'];
      const target = parsedTargets.length > 0 ? parsedTargets.join(', ') : '120363414573336812@g.us';

      const wspPatch = {
        enabled: $('cfgWspEnabled').checked,
        target,
        notifyTomas: $('cfgWspTomas').checked,
        notifyPanales: $('cfgWspPanales').checked,
        notifyVitaminas: $('cfgWspVitaminas').checked,
        notifySueno: $('cfgWspSueno').checked,
        notifyAlertaHambre: $('cfgWspAlertHambre') ? $('cfgWspAlertHambre').checked : true,
        notifyAlertaVitaminas: $('cfgWspAlertVits') ? $('cfgWspAlertVits').checked : true,
        notifyAlertaFecas: $('cfgWspAlertFecas') ? $('cfgWspAlertFecas').checked : true,
        notifyAlertaSueno: $('cfgWspAlertSueno') ? $('cfgWspAlertSueno').checked : true,
        notifyAlertaPanal: $('cfgWspAlertPanal') ? $('cfgWspAlertPanal').checked : true,
        notifyInformeDiario: $('cfgWspInformeDiario') ? $('cfgWspInformeDiario').checked : true,
      };
      patch.whatsapp_config = wspPatch;
      if (typeof saveWhatsAppConfig === 'function') {
        await saveWhatsAppConfig(wspPatch, bebe?.id, db);
      }
    }

    const ok = await actualizarBebe(patch);
    if (ok) $('settingsModal').classList.add('hidden');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Controladores Interactivos de WhatsApp Gateway ----------
let wspQrInterval = null;
let wspStatusInterval = null;

function detenerPollingWhatsApp() {
  if (wspQrInterval) { clearInterval(wspQrInterval); wspQrInterval = null; }
  if (wspStatusInterval) { clearInterval(wspStatusInterval); wspStatusInterval = null; }
}

async function actualizarBadgeEstadoWhatsApp() {
  const badge = $('cfgWspStatusBadge');
  if (!badge || typeof getWhatsAppConnectionState !== 'function') return 'error';

  const res = await getWhatsAppConnectionState();
  const state = res.state || 'close';

  if (state === 'open') {
    badge.textContent = '🟢 Conectado';
    badge.style.background = 'rgba(25, 158, 112, 0.2)';
    badge.style.color = '#199e70';
    if ($('cfgWspQrBtn')) $('cfgWspQrBtn').textContent = '✅ WhatsApp Vinculado';
    $('cfgWspSuccessWrap')?.classList.remove('hidden');
    $('cfgWspScanInstructions')?.classList.add('hidden');
    detenerPollingWhatsApp();
  } else if (state === 'connecting') {
    badge.textContent = '🟡 Esperando vinculación';
    badge.style.background = 'rgba(201, 133, 0, 0.2)';
    badge.style.color = '#fbbf24';
    if ($('cfgWspQrBtn')) $('cfgWspQrBtn').textContent = '📷 Vincular con WhatsApp (Ver QR)';
    $('cfgWspSuccessWrap')?.classList.add('hidden');
    $('cfgWspScanInstructions')?.classList.remove('hidden');
  } else {
    badge.textContent = '🔴 Desconectado';
    badge.style.background = 'rgba(239, 68, 68, 0.2)';
    badge.style.color = '#ef4444';
    if ($('cfgWspQrBtn')) $('cfgWspQrBtn').textContent = '📷 Vincular con WhatsApp (Ver QR)';
    $('cfgWspSuccessWrap')?.classList.add('hidden');
    $('cfgWspScanInstructions')?.classList.remove('hidden');
  }
  return state;
}

$('cfgWspEnabled')?.addEventListener('change', (e) => {
  $('cfgWspPanel')?.classList.toggle('hidden', !e.target.checked);
  if (e.target.checked) actualizarBadgeEstadoWhatsApp();
  else detenerPollingWhatsApp();
});

$('cfgWspQrBtn')?.addEventListener('click', () => {
  const cont = $('cfgWspQrContainer');
  if (!cont) return;
  const isHidden = cont.classList.contains('hidden');
  if (isHidden) {
    cont.classList.remove('hidden');
    iniciarSesionQRWhatsApp();
  } else {
    cont.classList.add('hidden');
    detenerPollingWhatsApp();
  }
});

$('cfgWspQrRefresh')?.addEventListener('click', () => {
  cargarCodigoQRWhatsApp();
});

async function iniciarSesionQRWhatsApp() {
  detenerPollingWhatsApp();
  await cargarCodigoQRWhatsApp();

  // Renueva el QR automáticamente cada 18 segundos para que nunca caduque en pantalla
  wspQrInterval = setInterval(async () => {
    const cont = $('cfgWspQrContainer');
    if (!cont || cont.classList.contains('hidden')) {
      detenerPollingWhatsApp();
      return;
    }
    await cargarCodigoQRWhatsApp();
  }, 45000); // 45s para permitir escaneo

  // Consulta el estado cada 3 segundos para detectar el momento exacto en que se empareja
  wspStatusInterval = setInterval(async () => {
    const cont = $('cfgWspQrContainer');
    if (!cont || cont.classList.contains('hidden')) {
      detenerPollingWhatsApp();
      return;
    }
    const state = await actualizarBadgeEstadoWhatsApp();
    if (state === 'open') {
      detenerPollingWhatsApp();
      toast('¡WhatsApp vinculado exitosamente! ✓');
    }
  }, 3000);
}

async function cargarCodigoQRWhatsApp() {
  const img = $('cfgWspQrImg');
  const loading = $('cfgWspQrLoading');
  const pairingWrap = $('cfgWspPairingWrap');
  const pairingCode = $('cfgWspPairingCode');
  if (!img || !loading) return;

  // Si ya está conectado, no pide nuevo QR
  const estado = await actualizarBadgeEstadoWhatsApp();
  if (estado === 'open') return;

  const res = await getWhatsAppQR();
  loading.classList.add('hidden');

  if (res.ok && res.base64) {
    img.src = res.base64;
    img.classList.remove('hidden');
    if (res.pairingCode && pairingWrap && pairingCode) {
      pairingCode.textContent = res.pairingCode;
      pairingWrap.classList.remove('hidden');
    } else if (pairingWrap) {
      pairingWrap.classList.add('hidden');
    }
  } else {
    loading.textContent = res.error ? `Error: ${res.error}` : 'Renovando código QR…';
    loading.classList.remove('hidden');
  }
}

$('cfgWspLoadGroupsBtn')?.addEventListener('click', async () => {
  const box = $('cfgWspGroupsBox');
  const list = $('cfgWspGroupsList');
  if (!box || !list) return;

  if (!box.classList.contains('hidden')) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  list.innerHTML = '<span style="color:var(--muted); padding:6px 0;">Consultando grupos de tu WhatsApp…</span>';

  if (typeof getWhatsAppGroups !== 'function') {
    list.innerHTML = '<span style="color:#ef4444;">Función no disponible.</span>';
    return;
  }

  const res = await getWhatsAppGroups();
  if (!res.ok || !res.groups || res.groups.length === 0) {
    list.innerHTML = `<span style="color:var(--muted); padding:4px 0;">No se encontraron grupos o WhatsApp aún no está conectado. (${res.error || '0 grupos'})</span>`;
    return;
  }

  list.innerHTML = '';
  res.groups.forEach((g) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-radius:8px; background:rgba(255,255,255,0.06); cursor:pointer; gap:8px;';
    item.innerHTML = `
      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">
        <strong style="color:var(--text); font-size:0.8rem;">${escapeHtml(g.subject)}</strong>
        <div style="font-size:0.68rem; color:var(--muted); font-family:monospace;">${g.id}</div>
      </div>
      <button type="button" class="btn-secondary" style="font-size:0.7rem; padding:3px 8px; flex-shrink:0;">+ Añadir</button>
    `;

    item.addEventListener('click', () => {
      const input = $('cfgWspTarget');
      if (!input) return;
      const current = input.value.trim();
      const existing = typeof normalizarDestinatarios === 'function' ? normalizarDestinatarios(current) : [];
      if (existing.includes(g.id)) {
        toast(`El grupo "${g.subject}" ya está en la lista.`);
        return;
      }
      input.value = current ? `${current}, ${g.id}` : g.id;
      actualizarPreviewDestinatarios();
      toast(`Grupo "${g.subject}" añadido ✓`);
    });

    list.appendChild(item);
  });
});

$('cfgWspCloseGroupsBtn')?.addEventListener('click', () => {
  $('cfgWspGroupsBox')?.classList.add('hidden');
});

$('cfgWspSetGroupBtn')?.addEventListener('click', () => {
  const input = $('cfgWspTarget');
  if (!input) return;
  input.value = window.NEBU_GROUP_JID || '120363414573336812@g.us';
  actualizarPreviewDestinatarios();
  toast('Configurado: Solo grupo Alertas Nebubu ✓');
});

function actualizarPreviewDestinatarios() {
  const input = $('cfgWspTarget');
  const preview = $('cfgWspTargetPreview');
  const chips = $('cfgWspTargetChips');
  if (!input || !preview || !chips) return;

  // Auto-convertir enlaces de grupo pegados directamente
  if (input.value.includes('chat.whatsapp.com/')) {
    const match = input.value.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const code = match[1];
      if (code === 'LWYU1T9wGW72wEwlcfSPDy') {
        input.value = input.value.replace(/https?:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9_-]+/g, '120363414573336812@g.us');
        toast('Enlace convertido a grupo "Alertas Nebubu" ✓');
      }
    }
  }

  const val = input.value.trim();
  if (!val) {
    preview.classList.add('hidden');
    chips.innerHTML = '';
    return;
  }

  const targets = typeof normalizarDestinatarios === 'function' ? normalizarDestinatarios(val) : [];
  if (targets.length === 0) {
    preview.classList.remove('hidden');
    chips.innerHTML = '<span style="color:#ef4444; font-size:0.72rem;">⚠️ Ningún número o grupo válido detectado</span>';
    return;
  }

  preview.classList.remove('hidden');
  chips.innerHTML = '';
  targets.forEach((t) => {
    const chip = document.createElement('span');
    chip.style.cssText = 'background:rgba(25, 158, 112, 0.2); border:1px solid #199e70; color:#199e70; padding:2px 6px; border-radius:6px; font-size:0.72rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;';
    const isGroup = t.includes('@g.us');
    let label = isGroup ? `👥 Grupo (${t.split('@')[0].slice(-6)})` : `📱 +${t}`;
    if (t === '120363414573336812@g.us') label = '👥 Alertas Nebubu';
    chip.textContent = label;
    chips.appendChild(chip);
  });
}

$('cfgWspTarget')?.addEventListener('input', actualizarPreviewDestinatarios);
$('cfgWspTarget')?.addEventListener('change', actualizarPreviewDestinatarios);

$('cfgWspTestBtn')?.addEventListener('click', async () => {
  const btn = $('cfgWspTestBtn');
  const resEl = $('cfgWspTestResult');
  const target = $('cfgWspTarget').value.trim();

  if (!target) {
    resEl.textContent = '⚠️ Ingresa primero al menos un número de teléfono o ID de grupo.';
    resEl.style.color = '#fbbf24';
    resEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando prueba…';
  resEl.classList.add('hidden');

  const res = await probarConexionWhatsApp(target);
  btn.disabled = false;
  btn.textContent = '📲 Probar envío de WhatsApp';

  resEl.textContent = res.message;
  resEl.style.color = res.ok ? '#199e70' : '#ef4444';
  resEl.classList.remove('hidden');
});

$('btnEnviarInformeWspManual')?.addEventListener('click', async () => {
  const btn = $('btnEnviarInformeWspManual');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>⏳</span> Enviando informe al grupo…';

  try {
    if (typeof enviarInformeDiarioManual === 'function') {
      enviarInformeDiarioManual(cache, { bebe, miRol });
      toast('¡Informe diario enviado al grupo de WhatsApp! ✓');

      // Marcar como enviado localmente para hoy
      const nowD = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const hoyK = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;
      let rawTs = {};
      try { rawTs = JSON.parse(localStorage.getItem('nebu_alert_timestamps') || '{}'); } catch {}
      rawTs.informe_diario = hoyK;
      try { localStorage.setItem('nebu_alert_timestamps', JSON.stringify(rawTs)); } catch {}

      if (currentTab === 'alertas') renderAlertas();
    }
  } catch (err) {
    toast(`Error al enviar informe: ${err.message}`, true);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }, 2000);
  }
});

// ---------- Recarga de Datos y Auto-Refresh ----------
let lastRefreshTime = Date.now();
let autoRefreshTimer = null;
let alertCheckInterval = null;
let bgWorker = null;
let realtimeChannel = null;

async function recargarDatos(mostrarAviso = false) {
  if (!appStarted || !bebe?.id) return;
  if (mostrarAviso) toast('Recargando…');
  try {
    const { data: b } = await db.from('bebes').select('*').eq('id', bebe.id).maybeSingle();
    if (b) {
      bebe = b;
      aplicarBebe();
    }
    await loadAll();
    if (typeof actualizarAlertasYBadge === 'function') {
      actualizarAlertasYBadge();
    }
    renderTab(currentTab);
    lastRefreshTime = Date.now();
  } catch (err) {
    console.error('Error al actualizar datos:', err);
  }
}

function iniciarAutoRefresh() {
  detenerAutoRefresh();
  lastRefreshTime = Date.now();

  // 1. Supervisión continua de alertas cada 60 segundos (evalúa umbrales y dispara reiteraciones cada 15 min exactos)
  alertCheckInterval = setInterval(async () => {
    if (appStarted && bebe?.id) {
      if (typeof actualizarAlertasYBadge === 'function') {
        await actualizarAlertasYBadge();
      }
    }
  }, 60 * 1000);

  // 2. Temporizador estándar cada 15 minutos (900.000 ms) incondicional para sincronización remota completa
  autoRefreshTimer = setInterval(() => {
    if (appStarted && bebe?.id) {
      recargarDatos(false);
    }
  }, 15 * 60 * 1000);

  // 3. Web Worker Heartbeat en segundo plano (para evitar que el navegador suspenda el temporizador al cambiar de pestaña/pantalla)
  try {
    const workerBlob = new Blob([
      `setInterval(function() { postMessage('tick'); }, 15 * 60 * 1000);`
    ], { type: 'application/javascript' });
    bgWorker = new Worker(URL.createObjectURL(workerBlob));
    bgWorker.onmessage = () => {
      if (appStarted && bebe?.id) {
        recargarDatos(false);
      }
    };
  } catch (e) {
    console.warn('Web Worker en segundo plano no disponible:', e);
  }

  // 4. Suscripción Supabase Realtime para sincronización instantánea adicional
  try {
    if (bebe?.id) {
      realtimeChannel = db
        .channel(`realtime_bebe_${bebe.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', filter: `bebe_id=eq.${bebe.id}` }, () => {
          recargarDatos(false);
        })
        .subscribe();
    }
  } catch (e) {
    console.warn('Supabase Realtime no disponible:', e);
  }
}

function detenerAutoRefresh() {
  if (alertCheckInterval) {
    clearInterval(alertCheckInterval);
    alertCheckInterval = null;
  }
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (bgWorker) {
    bgWorker.terminate();
    bgWorker = null;
  }
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// Al regresar a la pestaña o desbloquear pantalla:
// Siempre recargar primero los datos remotos de Supabase para evitar alertas con caché desfasada
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && appStarted && bebe?.id) {
    await recargarDatos(false);
  }
});

$('logoutBtn').addEventListener('click', () => db.auth.signOut());
$('reloadBtn').addEventListener('click', () => recargarDatos(true));

// ---------- Temas y Paletas ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('tema', theme);
  if (appStarted && currentTab === 'stats') renderCharts();
}
function applyPalette(pal) { document.documentElement.dataset.palette = pal; }

$('themeBtn').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ---------- Autenticación ----------
let modoRegistro = false;

function precargarCredenciales() {
  if (localStorage.getItem('recordar') !== '1') return;
  $('authRemember').checked = true;
  $('authEmail').value = localStorage.getItem('cred_email') || '';
  $('authPass').value = localStorage.getItem('cred_pass') || '';
}

function guardarCredenciales(email, password) {
  if ($('authRemember').checked) {
    localStorage.setItem('recordar', '1');
    localStorage.setItem('cred_email', email);
    localStorage.setItem('cred_pass', password);
  } else {
    localStorage.removeItem('recordar');
    localStorage.removeItem('cred_email');
    localStorage.removeItem('cred_pass');
  }
}

$('passToggle').addEventListener('click', () => {
  const input = $('authPass');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  $('passToggle').textContent = visible ? '👁️' : '🙈';
});

$('authToggle').addEventListener('click', () => {
  modoRegistro = !modoRegistro;
  $('authTitle').textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  $('authSubmit').textContent = modoRegistro ? 'Registrarme' : 'Entrar';
  $('authToggle').textContent = modoRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  $('authError').classList.add('hidden');
});

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPass').value;
  $('authSubmit').disabled = true;
  $('authError').classList.add('hidden');
  try {
    if (modoRegistro) {
      const { data: autorizado, error: errWl } = await db.rpc('email_autorizado', { correo: email });
      if (errWl) throw errWl;
      if (!autorizado) throw new Error('Este correo no está autorizado para registrarse.');
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        $('authError').textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.';
        $('authError').classList.remove('hidden');
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      guardarCredenciales(email, password);
    }
  } catch (err) {
    let msg = err.message;
    if (msg === 'Invalid login credentials') msg = 'Correo o contraseña incorrectos';
    else if (/database error/i.test(msg)) msg = 'Este correo no está autorizado para registrarse.';
    else if (esErrorPausaSupabase(err)) msg = MENSAJE_PAUSA_SUPABASE;
    $('authError').textContent = msg;
    $('authError').classList.remove('hidden');
  } finally {
    $('authSubmit').disabled = false;
  }
});

// ---------- Vinculación del Bebé ----------
const rolSeleccionado = () => document.querySelector('input[name="linkRol"]:checked')?.value || 'madre';

function mostrarLinkError(msg) {
  $('linkError').textContent = msg;
  $('linkError').classList.remove('hidden');
}

$('formCrearBebe').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  $('linkError').classList.add('hidden');
  try {
    const { data, error } = await db.rpc('crear_bebe', {
      p_nombre: $('nuevoNombre').value.trim(),
      p_rol: rolSeleccionado(),
    });
    if (error) { mostrarLinkError(error.message); return; }
    iniciarApp(data, rolSeleccionado());
    toast(`Código para vincular: ${data.codigo} (también está en ⚙️)`);
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('formUnirse').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  $('linkError').classList.add('hidden');
  try {
    const codigo = $('codigoInput').value.trim();
    if (!codigo) { mostrarLinkError('Escribe el código del bebé'); return; }
    const { data, error } = await db.rpc('unirse_bebe', { p_codigo: codigo, p_rol: rolSeleccionado() });
    if (error) { mostrarLinkError(error.message); return; }
    iniciarApp(data, rolSeleccionado());
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('linkLogout').addEventListener('click', () => db.auth.signOut());

// ---------- Entrada ----------
async function entrar(session) {
  usuario = session.user;
  $('authScreen').classList.add('hidden');
  const { data: miembro, error } = await db.from('miembros').select('*').eq('user_id', usuario.id).maybeSingle();
  if (error) { toast(`Error: ${error.message}`, true); return; }
  if (!miembro) {
    $('app').classList.add('hidden');
    $('linkScreen').classList.remove('hidden');
    return;
  }
  const { data: b, error: e2 } = await db.from('bebes').select('*').eq('id', miembro.bebe_id).maybeSingle();
  if (e2 || !b) { toast('No se pudo cargar el bebé', true); return; }
  iniciarApp(b, miembro.rol);
}

function iniciarApp(b, rol) {
  bebe = b;
  miRol = rol;
  $('linkScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  appStarted = true;
  aplicarBebe();
  setNowDefaults();
  activarTab(localStorage.getItem('tab') || 'stats');
  renderLecheResumen();
  iniciarAutoRefresh();
  loadAll().then(async () => {
    await asegurarVitaminasPredeterminadas();
    if (typeof actualizarAlertasYBadge === 'function') {
      actualizarAlertasYBadge();
    }
    renderTab(currentTab);
  });
}

function showAuth() {
  appStarted = false;
  detenerAutoRefresh();
  bebe = null; miRol = null; usuario = null;
  $('app').classList.add('hidden');
  $('linkScreen').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
}

// ---------- Fondo Animado (Canvas) ----------
const bgCanvas = $('bgCanvas');
const bgCtx = bgCanvas.getContext('2d');
let bgTipo = localStorage.getItem('fondo') || 'none';
let bgPausado = localStorage.getItem('fondo_pausa') === '1';
let bgRaf = null, bgT = 0, estrellas = [], burbujas = [];

function bgResize() {
  bgCanvas.width = innerWidth * devicePixelRatio;
  bgCanvas.height = innerHeight * devicePixelRatio;
  bgCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function bgInitParticulas() {
  estrellas = Array.from({ length: 110 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: 0.4 + Math.random() * 1.4, f: Math.random() * Math.PI * 2, v: 0.02 + Math.random() * 0.06,
  }));
  burbujas = Array.from({ length: 26 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: 2 + Math.random() * 7, v: 0.15 + Math.random() * 0.5, f: Math.random() * Math.PI * 2,
  }));
}

function bgDibujar() {
  const oscuro = document.documentElement.dataset.theme !== 'light';
  const w = innerWidth, h = innerHeight;
  bgCtx.clearRect(0, 0, w, h);

  if (bgTipo === 'espacio') {
    for (const e of estrellas) {
      e.x += e.v; if (e.x > w) e.x = 0;
      const brillo = 0.55 + 0.45 * Math.sin(bgT * 1.5 + e.f);
      bgCtx.globalAlpha = (oscuro ? 0.9 : 0.5) * brillo;
      bgCtx.fillStyle = oscuro ? '#ffffff' : '#4a3aa7';
      bgCtx.beginPath(); bgCtx.arc(e.x, e.y, e.r, 0, 7); bgCtx.fill();
    }
    bgCtx.globalAlpha = 1;
  } else if (bgTipo === 'mar') {
    const colores = oscuro
      ? ['rgba(57,135,229,0.10)', 'rgba(25,158,112,0.08)', 'rgba(57,135,229,0.07)']
      : ['rgba(42,120,214,0.12)', 'rgba(14,138,95,0.09)', 'rgba(42,120,214,0.08)'];
    colores.forEach((c, i) => {
      bgCtx.fillStyle = c;
      bgCtx.beginPath();
      bgCtx.moveTo(0, h);
      const base = h * (0.55 + i * 0.13), amp = 14 + i * 8, fase = bgT * (0.5 + i * 0.25), lon = 0.008 - i * 0.002;
      for (let x = 0; x <= w; x += 8) bgCtx.lineTo(x, base + Math.sin(x * lon + fase) * amp);
      bgCtx.lineTo(w, h);
      bgCtx.closePath();
      bgCtx.fill();
    });
    for (const b of burbujas) {
      b.y -= b.v; b.x += Math.sin(bgT + b.f) * 0.3;
      if (b.y < -10) { b.y = h + 10; b.x = Math.random() * w; }
      bgCtx.globalAlpha = oscuro ? 0.18 : 0.25;
      bgCtx.strokeStyle = oscuro ? '#9ec5f4' : '#2a78d6';
      bgCtx.lineWidth = 1.2;
      bgCtx.beginPath(); bgCtx.arc(b.x, b.y, b.r, 0, 7); bgCtx.stroke();
    }
    bgCtx.globalAlpha = 1;
  }
}

function bgLoop() {
  bgT += 0.016;
  bgDibujar();
  bgRaf = requestAnimationFrame(bgLoop);
}

function aplicarFondo() {
  cancelAnimationFrame(bgRaf); bgRaf = null;
  if (bgTipo === 'none') {
    bgCtx.clearRect(0, 0, innerWidth, innerHeight);
  } else {
    if (!estrellas.length) bgInitParticulas();
    if (bgPausado) bgDibujar();
    else bgLoop();
  }
  document.querySelectorAll('.bg-opt').forEach((b) => b.classList.toggle('selected', b.dataset.bg === bgTipo));
  $('bgPauseBtn').textContent = bgPausado ? '▶️' : '⏸️';
}

window.addEventListener('resize', () => { bgResize(); if (bgTipo !== 'none' && !bgRaf) bgDibujar(); });

$('bgRow').addEventListener('click', (e) => {
  const opt = e.target.closest('.bg-opt');
  if (!opt) return;
  bgTipo = opt.dataset.bg;
  localStorage.setItem('fondo', bgTipo);
  aplicarFondo();
});

$('bgPauseBtn').addEventListener('click', () => {
  bgPausado = !bgPausado;
  localStorage.setItem('fondo_pausa', bgPausado ? '1' : '0');
  aplicarFondo();
});

// ---------- Inicialización ----------
applyTheme(localStorage.getItem('tema') || 'dark');
bgResize();
aplicarFondo();
renderTabbar();
restaurarCrono();
precargarCredenciales();

if (!configurado) {
  showAuth();
  $('authError').textContent = '⚠️ Falta config.js con SUPABASE_URL y SUPABASE_ANON_KEY (ver config.example.js)';
  $('authError').classList.remove('hidden');
} else {
  let entrando = false;
  db.auth.onAuthStateChange((_evento, session) => {
    if (!session) { showAuth(); return; }
    if (appStarted || entrando) return;
    entrando = true;
    entrar(session).finally(() => { entrando = false; });
  });
}
