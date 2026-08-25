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
    const k = dayKey(new Date(r[field]));
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

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
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
  return true;
}

async function eliminar(tabla, id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await db.from(tabla).delete().eq('id', id);
  if (error) { toast(`Error al eliminar: ${error.message}`, true); return; }
  await loadData(tabla);
  statsDirty = true;
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
        html += `<tr class="week-row week-toggle${semAbierta ? ' abierto' : ''}" data-week="${sem.key}"><td colspan="${cols}"><span class="caret">${semAbierta ? '▾' : '▸'}</span> <strong>${sem.label}</strong></td></tr>`;
        for (const [key, rows] of sem.dias) {
          const diaAbierto = semAbierta && key === hoy;
          const subtotal = subtotalFn ? `<span style="float:right">${subtotalFn(rows)}</span>` : '';
          html += `<tr class="day-row day-toggle w-${sem.key}${semAbierta ? '' : ' hidden'}${diaAbierto ? ' abierto' : ''}" data-day="${key}"><td colspan="${cols}"><span class="caret">${diaAbierto ? '▾' : '▸'}</span> ${fmtDayLabel(key)}${subtotal}</td></tr>`;
          html += rows.map(filaFn).map((tr) => tr.replace('<tr>', `<tr class="drow d-${key} w-${sem.key}${diaAbierto ? '' : ' hidden'}">`)).join('');
        }
      }
    } else {
      // Mes completado: colapsado en un renglón mensual
      const todasFilas = grupoMes.semanas.flatMap((s) => s.dias.flatMap(([, rows]) => rows));
      const subtotalMes = subtotalMesFn ? `<span style="float:right">${subtotalMesFn(todasFilas)}</span>` : '';
      html += `<tr class="month-row month-toggle" data-month="${grupoMes.mes}"><td colspan="${cols}"><span class="caret">▸</span> <strong>${fmtMesLabel(grupoMes.mes)}</strong>${subtotalMes}</td></tr>`;
      for (const sem of grupoMes.semanas) {
        html += `<tr class="week-row week-toggle m-${grupoMes.mes} hidden" data-week="${sem.key}"><td colspan="${cols}"><span class="caret">▸</span> ${sem.label}</td></tr>`;
        for (const [key, rows] of sem.dias) {
          const subtotal = subtotalFn ? `<span style="float:right">${subtotalFn(rows)}</span>` : '';
          html += `<tr class="day-row day-toggle m-${grupoMes.mes} w-${sem.key} hidden" data-day="${key}"><td colspan="${cols}"><span class="caret">▸</span> ${fmtDayLabel(key)}${subtotal}</td></tr>`;
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
  const fechaSel = $('vitTipoFecha').value || dayKey(new Date());
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
  const dias = [...new Set((cache.vitaminas_tipos_log || []).map((l) => l.fecha))].sort().reverse();
  const itemsDelDia = (d) => (cache.vitaminas_tipos_log || [])
    .filter((l) => l.fecha === d)
    .map((l) => ({ l, v: mapa.get(String(l.vitamina_id)) }))
    .filter((x) => x.v)
    .map(({ l, v }) => `<tr><td>${escapeHtml(v.nombre)}</td><td>${l.gotas ?? v.gotas_default ?? 5} gotas ✅${l.hora ? ' · ' + l.hora.slice(0, 5) : ''}</td>${accionesTd('vitaminas_tipos_log', l.id)}</tr>`);

  $('tablaVitaminaTipos').innerHTML = historialChecklistHTML(dias, itemsDelDia, 3);
}

// Toggle vitamina en checklist
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.past-btn');
  if (!btn || !btn.dataset.id) return;
  const vitId = Number(btn.dataset.id);
  const fecha = $('vitTipoFecha').value || dayKey(new Date());
  const hora = ($('vitTipoHora').value || fmtTime(new Date())) + ':00';
  const yaTomada = btn.classList.contains('tomada');
  const v = (cache.vitaminas_tipos || []).find((x) => x.id === vitId);
  const gotas = v?.gotas_default || 5;

  if (!yaTomada) {
    await db.from('vitaminas_tipos_log').upsert({ bebe_id: bebe.id, vitamina_id: vitId, fecha, hora, gotas }, { onConflict: 'vitamina_id,fecha' });
  } else {
    await db.from('vitaminas_tipos_log').delete().eq('vitamina_id', vitId).eq('fecha', fecha);
  }
  await loadData('vitaminas_tipos_log');
  statsDirty = true;
  renderVitaminaTipos();
});

// ---------- Pañales ----------
function renderPanales() {
  const rows = cache.panales || [];
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
      const tipos = [r.heces && '💩 Heces', r.orina && '💧 Orina'].filter(Boolean).join(' · ') || '—';
      return `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${tipos}</td>${accionesTd('panales', r.id)}</tr>`;
    },
    (rs) => `💩 ${rs.filter((r) => r.heces).length} · 💧 ${rs.filter((r) => r.orina).length}`,
    (rs) => `💩 ${rs.filter((r) => r.heces).length} · 💧 ${rs.filter((r) => r.orina).length}`
  );
}

// ---------- Sueño ----------
function duracionMin(r) {
  if (!r.inicio || !r.fin) return 0;
  return Math.max(0, (new Date(r.fin) - new Date(r.inicio)) / 60000);
}

function tramosPorDia(r) {
  if (!r.inicio || !r.fin) return [];
  const ini = new Date(r.inicio), fin = new Date(r.fin);
  if (fin <= ini) return [];
  const tramos = [];
  let cur = new Date(ini);
  while (cur < fin) {
    const dStr = dayKey(cur);
    const midNext = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0);
    const finTramo = fin < midNext ? fin : midNext;
    const mins = (finTramo - cur) / 60000;
    if (mins > 0) tramos.push({ key: dStr, mins });
    cur = finTramo;
  }
  return tramos;
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
  const tick = () => { $('siestaLleva').textContent = fmtDur(Math.max(0, (Date.now() - ini) / 60000)); };
  tick();
  siestaTimer = setInterval(tick, 30000);
}

function renderSueno() {
  const rows = cache.sueno || [];
  const siestaActiva = rows.find((r) => !r.fin);
  pintarSiestaActiva(siestaActiva);

  const cerradas = rows.filter((r) => r.fin);
  if (!cerradas.length) {
    $('despiertoHace').textContent = '—';
    $('ultimoSueno').textContent = 'Sin registros';
  } else {
    const ultFin = new Date(cerradas[0].fin);
    $('despiertoHace').textContent = fmtDur(Math.max(0, (Date.now() - ultFin) / 60000));
    const ult = cerradas[0];
    $('ultimoSueno').textContent = `${fmtTime(new Date(ult.inicio))} - ${fmtTime(new Date(ult.fin))} · ${fmtDur(duracionMin(ult))}`;
  }

  $('tablaSueno').innerHTML = tablaHTML(
    ['Inicio', 'Fin', 'Duración'],
    groupByDay(rows, 'inicio'),
    (r) => {
      const finTxt = r.fin ? fmtTime(new Date(r.fin)) : '<span style="color:var(--accent)">Durmiendo…</span>';
      const durTxt = r.fin ? fmtDur(duracionMin(r)) : '—';
      return `<tr><td>${fmtTime(new Date(r.inicio))}</td><td>${finTxt}</td><td>${durTxt}</td>${accionesTd('sueno', r.id)}</tr>`;
    },
    (rs) => fmtDur(rs.reduce((s, r) => s + duracionMin(r), 0)),
    (rs) => fmtDur(rs.reduce((s, r) => s + duracionMin(r), 0))
  );
}

// Botones de siesta en vivo
$('btnDormir').addEventListener('click', async () => {
  const ok = await insertar('sueno', { inicio: new Date().toISOString(), fin: null });
  if (ok) renderSueno();
});

$('btnDespertar').addEventListener('click', async () => {
  const siesta = (cache.sueno || []).find((r) => !r.fin);
  if (!siesta) return;
  const { error } = await db.from('sueno').update({ fin: new Date().toISOString() }).eq('id', siesta.id);
  if (error) { toast(`Error: ${error.message}`, true); return; }
  await loadData('sueno');
  statsDirty = true;
  toast('Siesta registrada ✓');
  renderSueno();
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
    const label = numDias === 1
      ? 'Hoy'
      : d.toLocaleDateString('es', { weekday: numDias <= 7 ? 'short' : undefined, day: 'numeric', month: numDias > 7 ? 'short' : undefined });
    dias.push({ key: dayKey(d), label });
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

const BAR = { maxBarThickness: 32, borderRadius: 5, categoryPercentage: 0.72, barPercentage: 0.9 };
const LINEA = { tension: 0.32, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, fill: false };

function baseChartOpts(extraTooltip = {}) {
  const muted = cssVar('--muted'), grid = cssVar('--grid');
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
      x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 11 } } },
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
    '1d': 'hoy',
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

  const dias = obtenerDiasRango(statsRange);
  const labels = dias.map((d) => d.label);
  const s = {
    azul: cssVar('--brand-primary') || '#3987e5',
    ambar: cssVar('--brand-accent') || '#fbbf24',
    violeta: cssVar('--brand-secondary') || '#7c3aed',
    verde: cssVar('--brand-accent') || '#10b981',
  };
  const surface = cssVar('--surface');

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
    options: baseChartOpts({ callbacks: { label: (c) => ` ${c.parsed.y} ml` } }),
  });

  // 2. Vitaminas
  const vit = sumarPorDia(cache.vitaminas, 'fecha_hora', (r) => r.gotas);
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
    options: baseChartOpts({ callbacks: { label: (c) => ` ${c.parsed.y} gotas` } }),
  });

  // 3. Pañales
  const heces = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.heces ? 1 : 0));
  const orina = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.orina ? 1 : 0));
  const typePan = chartTypes.panales || 'bar';
  const optsPan = baseChartOpts();
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
    options: baseChartOpts({ callbacks: { label: (c) => ` ${fmtDur(c.parsed.y * 60)}` } }),
  });

  statsDirty = false;
}

// ---------- Tabs ----------
const TABS = {
  stats: { icon: '📊', label: 'Stats' },
  leche: { icon: '🍼', label: 'Leche' },
  vitaminas: { icon: '💊', label: 'Vitaminas' },
  panales: { icon: '🧷', label: 'Pañales' },
  sueno: { icon: '😴', label: 'Sueño' },
  info: { icon: '👶', label: 'Info' },
  bitacora: { icon: '📖', label: 'Bitácora' },
  juegos: { icon: '🧸', label: 'Juegos' },
};

const ORDEN_DEFAULT = ['stats', 'leche', 'vitaminas', 'panales', 'sueno', 'info', 'bitacora', 'juegos'];

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
    .map((k) => `<button class="tab-btn${k === currentTab ? ' active' : ''}" data-tab="${k}"><span>${TABS[k].icon}</span>${TABS[k].label}</button>`)
    .join('');

  if (mas.length) {
    const enMas = mas.includes(currentTab);
    const iconoActivo = enMas ? TABS[currentTab].icon : '⋯';
    const labelActivo = enMas ? TABS[currentTab].label : 'Más';
    html += `<button class="tab-btn${enMas ? ' active' : ''}" id="tabMasBtn" aria-haspopup="true"><span>${iconoActivo}</span>${labelActivo}</button>`;
    html += `<div class="tab-menu hidden" id="tabMenu">${mas
      .map((k) => `<button class="tab-btn tab-menu-item${k === currentTab ? ' active' : ''}" data-tab="${k}"><span>${TABS[k].icon}</span>${TABS[k].label}</button>`)
      .join('')}</div>`;
  }
  $('tabbar').innerHTML = html;
}

function renderTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  const el = $('tab-' + tab);
  if (el) el.classList.add('active');

  // Metatítulo dinámico y semántico para SEO/PWA
  const tabName = TABS[tab]?.label || 'Rutinas';
  document.title = `${tabName} | Rutinas del Bebé`;

  if (tab === 'stats') { if (statsDirty) renderCharts(); }
  else if (tab === 'leche') renderLeche();
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

// ---------- Formularios Principales ----------
$('formLeche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Number($('lecheCantidad').value);
  if (!v || v <= 0) { toast('Ingresa una cantidad válida', true); return; }
  const fh = $('lecheFechaHora').value ? new Date($('lecheFechaHora').value).toISOString() : new Date().toISOString();
  const ok = await insertar('tomas', { cantidad_ml: v, fecha_hora: fh });
  if (ok) { $('lecheCantidad').value = ''; setNowDefaults(); renderLeche(); }
});

$('lecheAhora').addEventListener('click', () => { $('lecheFechaHora').value = dtLocal(new Date()); });

$('formVitaminas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Number($('vitGotas').value);
  if (!v || v <= 0) { toast('Ingresa una cantidad válida', true); return; }
  const ok = await insertar('vitaminas', { gotas: v, fecha_hora: toISO($('vitFecha').value, $('vitHora').value) });
  if (ok) { setNowDefaults(); renderVitaminas(); }
});

$('formVitaminaTipo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('vitTipoNombre').value.trim();
  if (!nombre) return;
  const gotas = Number($('vitTipoGotas').value) || 5;
  const ok = await insertar('vitaminas_tipos', { nombre, gotas_default: gotas });
  if (ok) { $('vitTipoNombre').value = ''; $('vitTipoGotas').value = '5'; renderVitaminaTipos(); }
});

$('formPanales').addEventListener('submit', async (e) => {
  e.preventDefault();
  const h = $('panHeces').checked, o = $('panOrina').checked;
  if (!h && !o) { toast('Marca al menos heces u orina', true); return; }
  const fh = $('panFechaHora').value ? new Date($('panFechaHora').value).toISOString() : new Date().toISOString();
  const ok = await insertar('panales', { heces: h, orina: o, fecha_hora: fh });
  if (ok) { $('panHeces').checked = false; $('panOrina').checked = false; setNowDefaults(); renderPanales(); }
});

$('panAhora').addEventListener('click', () => { $('panFechaHora').value = dtLocal(new Date()); });

$('formSueno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('suenoFecha').value, ini = $('suenoInicio').value, fin = $('suenoFin').value;
  const dtIni = new Date(`${f}T${ini}`);
  let dtFin = new Date(`${f}T${fin}`);
  if (dtFin <= dtIni) dtFin = new Date(dtFin.getTime() + 86400000);
  const ok = await insertar('sueno', { inicio: dtIni.toISOString(), fin: dtFin.toISOString() });
  if (ok) { setNowDefaults(); renderSueno(); }
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
  const val = $('lataAbiertaInput').value;
  const fecha = val ? new Date(val) : new Date();
  const ok = await actualizarBebe({ lata_abierta_en: fecha.toISOString(), latas_usadas: (bebe?.latas_usadas || 0) + 1 });
  if (ok) toast('🥫 Nueva lata registrada');
});

// ---------- Bitácora ----------
function renderBitacora() {
  if (!$('bitFecha').value) $('bitFecha').value = dayKey(new Date());
  $('bitLista').innerHTML = historialColapsable(cache.bitacora || [], (r) => r.fecha, (r) => `
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
  const ok = await insertar('bitacora', {
    titulo,
    fecha: $('bitFecha').value || dayKey(new Date()),
    notas: $('bitNotas').value.trim() || null,
  });
  if (ok) { $('bitTitulo').value = ''; $('bitNotas').value = ''; $('bitFecha').value = dayKey(new Date()); renderBitacora(); }
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
});

// ---------- Edición Genérica de Registros ----------
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
    c.innerHTML = `
      <div class="check-row"><label class="check-pill"><input type="checkbox" id="edPanHeces" ${reg.heces ? 'checked' : ''}> 💩 Heces</label><label class="check-pill"><input type="checkbox" id="edPanOrina" ${reg.orina ? 'checked' : ''}> 💧 Orina</label></div>
      <div class="fila-2"><label>Fecha<input type="date" id="edPanFecha" value="${dayKey(d)}"></label><label>Hora<input type="time" id="edPanHora" value="${fmtTime(d)}"></label></div>`;
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
    patch = { heces: $('edPanHeces').checked, orina: $('edPanOrina').checked, fecha_hora: toISO($('edPanFecha').value, $('edPanHora').value) };
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
  await loadData(editTabla);
  statsDirty = true;
  $('editModal').classList.add('hidden');
  toast('Registro actualizado ✓');
  renderTab(currentTab);
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
});

// ---------- Configuración y Sincronización del Bebé ----------
async function actualizarBebe(patch) {
  const { data, error } = await db.from('bebes').update(patch).eq('id', bebe.id).select().single();
  if (error) { toast(`Error: ${error.message}`, true); return false; }
  bebe = data;
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
  $('settingsModal').classList.remove('hidden');
});

$('settingsClose').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
$('settingsModal').addEventListener('click', (e) => { if (e.target === $('settingsModal')) $('settingsModal').classList.add('hidden'); });

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
  const ok = await actualizarBebe(patch);
  if (ok) $('settingsModal').classList.add('hidden');
});

$('logoutBtn').addEventListener('click', () => db.auth.signOut());
$('reloadBtn').addEventListener('click', () => { toast('Recargando…'); loadAll().then(() => renderTab(currentTab)); });

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
  $('linkError').classList.add('hidden');
  const { data, error } = await db.rpc('crear_bebe', {
    p_nombre: $('nuevoNombre').value.trim(),
    p_rol: rolSeleccionado(),
  });
  if (error) { mostrarLinkError(error.message); return; }
  iniciarApp(data, rolSeleccionado());
  toast(`Código para vincular: ${data.codigo} (también está en ⚙️)`);
});

$('formUnirse').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('linkError').classList.add('hidden');
  const codigo = $('codigoInput').value.trim();
  if (!codigo) { mostrarLinkError('Escribe el código del bebé'); return; }
  const { data, error } = await db.rpc('unirse_bebe', { p_codigo: codigo, p_rol: rolSeleccionado() });
  if (error) { mostrarLinkError(error.message); return; }
  iniciarApp(data, rolSeleccionado());
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
  loadAll().then(() => renderTab(currentTab));
}

function showAuth() {
  appStarted = false;
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
