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
  for (const r of rows) {
    const k = dayKey(new Date(r[field]));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
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
  for (const id of ['vitFecha', 'suenoFecha']) $(id).value = f;
  for (const id of ['vitHora', 'suenoInicio', 'suenoFin']) $(id).value = h;
}

// ---------- Estado ----------
const cache = { tomas: null, vitaminas: null, panales: null, sueno: null, pastillas: null, pastillas_log: null, miembros: null, bitacora: null, controles: null };
let bebe = null;    // fila de la tabla bebes (nombre, foto, paleta, codigo)
let miRol = null;   // 'madre' | 'padre'
let usuario = null; // session.user
let statsDirty = true;
let appStarted = false;
let currentTab = 'stats';
let fotoPendiente; // base64 elegido en el modal, aún sin guardar

// ---------- Datos ----------
async function fetchTable(tabla, campoOrden) {
  const { data, error } = await db.from(tabla).select('*')
    .eq('bebe_id', bebe.id)
    .order(campoOrden, { ascending: false }).limit(500);
  if (error) { toast(`Error cargando ${tabla}: ${error.message}`, true); return []; }
  return data;
}

const ORDEN = { sueno: 'inicio', pastillas: 'id', pastillas_log: 'fecha', miembros: 'created_at', bitacora: 'fecha', controles: 'fecha' };
async function loadData(tabla) {
  cache[tabla] = await fetchTable(tabla, ORDEN[tabla] || 'fecha_hora');
}

async function loadAll() {
  await Promise.all(['tomas', 'vitaminas', 'panales', 'sueno', 'pastillas', 'pastillas_log', 'miembros', 'bitacora', 'controles'].map(loadData));
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

// Delegación de clicks para los botones ✏️/🗑 de todas las tablas
document.addEventListener('click', (e) => {
  const del = e.target.closest('.del-btn');
  if (del) { eliminar(del.dataset.tabla, del.dataset.id); return; }
  const ed = e.target.closest('.edit-btn');
  if (ed) {
    if (ed.dataset.tabla === 'controles') cargarControl(ed.dataset.id);
    else abrirEdicion(ed.dataset.tabla, ed.dataset.id);
  }
});

// ---------- Render de tablas ----------
function tablaHTML(headers, grupos, filaFn, subtotalFn) {
  if (!grupos.size) return '<p class="empty-msg">Sin registros todavía</p>';
  const cols = headers.length + 1;
  let html = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}<th></th></tr></thead><tbody>`;
  for (const [key, rows] of grupos) {
    const subtotal = subtotalFn ? `<span style="float:right">${subtotalFn(rows)}</span>` : '';
    html += `<tr class="day-row"><td colspan="${cols}">${fmtDayLabel(key)}${subtotal}</td></tr>`;
    html += rows.map(filaFn).join('');
  }
  return html + '</tbody></table>';
}

const botonesEdit = (tabla, id) =>
  `<button class="edit-btn" data-tabla="${tabla}" data-id="${id}" title="Editar">✏️</button><button class="del-btn" data-tabla="${tabla}" data-id="${id}" title="Eliminar">🗑</button>`;
const accionesTd = (tabla, id) => `<td class="td-action">${botonesEdit(tabla, id)}</td>`;

function renderLeche() {
  const rows = cache.tomas || [];
  $('tablaLeche').innerHTML = tablaHTML(
    ['Hora', 'Cantidad'],
    groupByDay(rows, 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.cantidad_ml} ml</td>${accionesTd('tomas', r.id)}</tr>`,
    (rs) => `Total: ${rs.reduce((s, r) => s + r.cantidad_ml, 0)} ml`
  );
  renderLecheResumen();
}

function renderLecheResumen() {
  const hoy = dayKey(new Date());
  const total = (cache.tomas || [])
    .filter((r) => dayKey(new Date(r.fecha_hora)) === hoy)
    .reduce((s, r) => s + r.cantidad_ml, 0);
  const objetivo = Number(localStorage.getItem('objetivo_leche')) || 800;
  $('objetivoInput').value = objetivo;
  $('lecheHoy').textContent = total;
  $('lecheProgress').style.width = Math.min(100, (total / objetivo) * 100) + '%';
  $('lecheStatus').textContent =
    total >= objetivo
      ? `🎉 ¡Meta cumplida! (+${total - objetivo} ml sobre el objetivo)`
      : `Faltan ${objetivo - total} ml para el objetivo 🎯`;

  // Fórmula: 30 ml ≈ 30 g (1:1). Lata: resta lo consumido desde que se abrió la lata actual
  const totalMl = (cache.tomas || []).reduce((s, r) => s + r.cantidad_ml, 0);
  const lata = Number(bebe?.lata_gramos) || 800;
  const abierta = bebe?.lata_abierta_en ? new Date(bebe.lata_abierta_en).getTime() : 0;
  const usadaLata = (cache.tomas || [])
    .filter((r) => new Date(r.fecha_hora).getTime() >= abierta)
    .reduce((s, r) => s + r.cantidad_ml, 0);
  $('lataInput').value = lata;
  $('lecheGramosHoy').textContent = total;
  // No pisar el input mientras se está editando
  if (document.activeElement !== $('lataAbiertaInput')) {
    const ad = abierta ? new Date(abierta) : new Date();
    $('lataAbiertaInput').value = `${dayKey(ad)}T${fmtTime(ad)}`;
  }
  const abiertaTxt = abierta
    ? new Date(abierta).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';
  $('lataStatus').textContent =
    `Quedan ~${Math.max(0, lata - usadaLata)} g · abierta ${abiertaTxt} · Latas usadas: ${bebe?.latas_usadas || 0} (${totalMl} g en total)`;

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

function renderVitaminas() {
  $('tablaVitaminas').innerHTML = tablaHTML(
    ['Hora', 'Gotas'],
    groupByDay(cache.vitaminas || [], 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.gotas} gotas</td>${accionesTd('vitaminas', r.id)}</tr>`
  );
}

const hm = (p) => `${escapeHtml(p.nombre)} · ${(p.horario || '').toUpperCase()}`;
const ordenarPastillas = (lista) =>
  lista.slice().sort((a, b) => (a.horario || '').localeCompare(b.horario || '') || (a.nombre || '').localeCompare(b.nombre || ''));

function renderPastillas() {
  const lista = ordenarPastillas(cache.pastillas || []);
  const hoy = dayKey(new Date());
  const tomadasHoy = new Set((cache.pastillas_log || []).filter((l) => l.fecha === hoy).map((l) => String(l.pastilla_id)));

  // Checklist de hoy
  $('pastHoy').innerHTML = lista.length
    ? lista.map((p) =>
        `<label class="check-pill"><input type="checkbox" class="pill-check" data-id="${p.id}" ${tomadasHoy.has(String(p.id)) ? 'checked' : ''}> ${hm(p)}</label>`
      ).join('')
    : '<p class="empty-msg">Agrega pastillas a tu lista abajo</p>';

  // Lista maestra (editar / eliminar)
  $('pastLista').innerHTML = lista.length
    ? `<table><tbody>${lista.map((p) => `<tr><td>${escapeHtml(p.nombre)}</td><td>${(p.horario || '').toUpperCase()}</td>${accionesTd('pastillas', p.id)}</tr>`).join('')}</tbody></table>`
    : '<p class="empty-msg">Aún no agregas pastillas</p>';

  // Historial por día
  const mapa = new Map((cache.pastillas || []).map((p) => [String(p.id), p]));
  const dias = [...new Set((cache.pastillas_log || []).map((l) => l.fecha))].sort().reverse();
  $('tablaPastillas').innerHTML = dias.length
    ? `<table><tbody>${dias.map((d) => {
        const items = ordenarPastillas(
          (cache.pastillas_log || []).filter((l) => l.fecha === d).map((l) => mapa.get(String(l.pastilla_id))).filter(Boolean)
        );
        return `<tr class="day-row"><td colspan="2">${fmtDayLabel(d)}</td></tr>` +
          items.map((p) => `<tr><td>${escapeHtml(p.nombre)}</td><td>${(p.horario || '').toUpperCase()} ✅</td></tr>`).join('');
      }).join('')}</tbody></table>`
    : '<p class="empty-msg">Sin registros todavía</p>';
}

// Marcar/desmarcar una pastilla como tomada HOY (crea/borra la fila del día)
document.addEventListener('change', (e) => {
  const chk = e.target.closest('.pill-check');
  if (chk) togglePastillaHoy(chk.dataset.id, chk.checked);
});

async function togglePastillaHoy(pastillaId, tomada) {
  const hoy = dayKey(new Date());
  const { error } = tomada
    ? await db.from('pastillas_log').upsert(
        { bebe_id: bebe.id, pastilla_id: Number(pastillaId), fecha: hoy },
        { onConflict: 'pastilla_id,fecha' }
      )
    : await db.from('pastillas_log').delete().eq('pastilla_id', pastillaId).eq('fecha', hoy);
  if (error) { toast(`Error: ${error.message}`, true); }
  await loadData('pastillas_log');
  renderPastillas();
}

function renderPanales() {
  const rows = cache.panales || [];
  $('tablaPanales').innerHTML = tablaHTML(
    ['Hora', 'Heces', 'Orina'],
    groupByDay(rows, 'fecha_hora'),
    (r) =>
      `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.heces ? '💩 Sí' : '—'}</td><td>${r.orina ? '💧 Sí' : '—'}</td>${accionesTd('panales', r.id)}</tr>`
  );
  renderPanalesDash();
}

function renderPanalesDash() {
  const rows = cache.panales || [];
  if (!rows.length) {
    $('ultimoCambio').textContent = '—';
    $('ultimaFeca').textContent = '—';
    return;
  }
  const mins = Math.max(0, (Date.now() - new Date(rows[0].fecha_hora)) / 60000);
  $('ultimoCambio').textContent = fmtDur(mins);
  const feca = rows.find((r) => r.heces);
  $('ultimaFeca').textContent = feca
    ? new Date(feca.fecha_hora).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ', ' + fmtTime(new Date(feca.fecha_hora))
    : 'Sin registros';
}

// Refresca el "hace X" cada minuto
setInterval(() => {
  if (!appStarted) return;
  if (cache.panales) renderPanalesDash();
  if (cache.tomas) renderLecheResumen();
  if (cache.sueno) renderSuenoDash();
}, 60000);

function duracionMin(r) {
  return (new Date(r.fin) - new Date(r.inicio)) / 60000;
}

// Divide una sesión de sueño en tramos por día, cortando en cada medianoche,
// para que cada día sume solo las horas dormidas dentro de ese día
function tramosPorDia(r) {
  const tramos = [];
  if (!r.fin) return tramos; // siesta en curso: aún sin duración
  let ini = new Date(r.inicio);
  const fin = new Date(r.fin);
  while (ini < fin) {
    const corte = new Date(ini);
    corte.setHours(24, 0, 0, 0);
    const finTramo = corte < fin ? corte : fin;
    tramos.push({
      key: dayKey(ini),
      inicio: ini,
      fin: finTramo,
      mins: (finTramo - ini) / 60000,
      id: r.id,
      esInicio: +ini === +new Date(r.inicio),
      esFin: +finTramo === +fin,
    });
    ini = finTramo;
  }
  return tramos;
}

function renderSueno() {
  const tramos = (cache.sueno || [])
    .flatMap(tramosPorDia)
    .sort((a, b) => b.inicio - a.inicio);
  $('tablaSueno').innerHTML = tablaHTML(
    ['Inicio', 'Fin', 'Duración'],
    groupByDay(tramos, 'inicio'),
    (t) =>
      `<tr><td>${t.esInicio ? '' : '↪ '}${fmtTime(t.inicio)}</td><td>${t.esFin ? fmtTime(t.fin) : '00:00 🌙'}</td><td>${fmtDur(t.mins)}</td>${accionesTd('sueno', t.id)}</tr>`,
    (ts) => `Durmió: ${fmtDur(ts.reduce((s, t) => s + t.mins, 0))}`
  );
  renderSuenoDash();
}

const siestaAbierta = () => (cache.sueno || []).find((r) => !r.fin) || null;

function renderSuenoDash() {
  const abierta = siestaAbierta();
  $('btnDormir').classList.toggle('hidden', !!abierta);
  $('siestaAbierta').classList.toggle('hidden', !abierta);

  const ult = (cache.sueno || [])
    .filter((r) => r.fin)
    .sort((a, b) => new Date(b.fin) - new Date(a.fin))[0];

  if (abierta) {
    $('siestaDesde').textContent = fmtTime(new Date(abierta.inicio));
    $('siestaLleva').textContent = fmtDur(Math.max(0, (Date.now() - new Date(abierta.inicio)) / 60000));
    $('despiertoHace').textContent = '😴 Durmiendo';
  } else {
    $('despiertoHace').textContent = ult ? fmtDur(Math.max(0, (Date.now() - new Date(ult.fin)) / 60000)) : '—';
  }
  $('ultimoSueno').textContent = ult
    ? `${fmtDur(duracionMin(ult))} · ${fmtTime(new Date(ult.inicio))}→${fmtTime(new Date(ult.fin))}`
    : 'Sin registros';
}

$('btnDormir').addEventListener('click', async () => {
  const ok = await insertar('sueno', { inicio: new Date().toISOString(), fin: null });
  if (ok) renderSueno();
});

$('btnDespertar').addEventListener('click', async () => {
  const abierta = siestaAbierta();
  if (!abierta) return;
  const { error } = await db.from('sueno').update({ fin: new Date().toISOString() }).eq('id', abierta.id);
  if (error) { toast(`Error: ${error.message}`, true); return; }
  await loadData('sueno');
  statsDirty = true;
  toast('Siesta registrada ✓');
  renderSueno();
});

// ---------- Gráficos (Chart.js) ----------
const charts = {};

const SERIES = {
  dark:  { azul: '#3987e5', ambar: '#c98500', violeta: '#9085e9' },
  light: { azul: '#2a78d6', ambar: '#eda100', violeta: '#4a3aa7' },
};

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function ultimos7Dias() {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    dias.push({ key: dayKey(d), label: d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }) });
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

function baseOpts(extraTooltip = {}) {
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

const BAR = { maxBarThickness: 26, borderRadius: 4, categoryPercentage: 0.72, barPercentage: 0.9 };
const LINEA = { tension: 0.3, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointHitRadius: 14, fill: false };

let statsMode = localStorage.getItem('stats_mode') || 'semana';

const TITULOS = {
  semana: {
    Leche: '🍼 Leche · últimos 7 días (ml)',
    Vitaminas: '💊 Vitaminas · últimos 7 días (gotas)',
    Panales: '🧷 Pañales · últimos 7 días',
    Sueno: '😴 Sueño · últimos 7 días (horas)',
  },
  diario: {
    Leche: '🍼 Leche · por toma, 3 días (ml)',
    Vitaminas: '💊 Vitaminas · por toma, 3 días (gotas)',
    Panales: '🧷 Pañales · acumulado, 3 días',
    Sueno: '😴 Sueño · por siesta, 3 días (horas)',
  },
};

function actualizarSegUI() {
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === statsMode));
  const diario = statsMode === 'diario';
  $('segHint').classList.toggle('hidden', !diario);
  document.querySelectorAll('.zoom-reset').forEach((b) => b.classList.toggle('hidden', !diario));
  for (const k of ['Leche', 'Vitaminas', 'Panales', 'Sueno']) $('titulo' + k).textContent = TITULOS[statsMode][k];
}

document.querySelectorAll('.seg-btn').forEach((b) =>
  b.addEventListener('click', () => {
    statsMode = b.dataset.mode;
    localStorage.setItem('stats_mode', statsMode);
    actualizarSegUI();
    renderCharts();
  })
);

document.querySelectorAll('.zoom-reset').forEach((b) =>
  b.addEventListener('click', () => charts[b.dataset.key]?.resetZoom())
);

function renderCharts() {
  Object.values(charts).forEach((c) => c.destroy());
  actualizarSegUI();
  if (statsMode === 'diario') renderChartsDiario();
  else renderChartsSemana();
  statsDirty = false;
}

function renderChartsSemana() {
  const dias = ultimos7Dias();
  const labels = dias.map((d) => d.label);
  const s = SERIES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
  const surface = cssVar('--surface');

  const leche = sumarPorDia(cache.tomas, 'fecha_hora', (r) => r.cantidad_ml);
  charts.leche = new Chart($('chartLeche'), {
    type: 'bar',
    data: { labels, datasets: [{ data: dias.map((d) => leche[d.key] || 0), backgroundColor: s.azul, ...BAR }] },
    options: baseOpts({ callbacks: { label: (c) => ` ${c.parsed.y} ml` } }),
  });

  const vit = sumarPorDia(cache.vitaminas, 'fecha_hora', (r) => r.gotas);
  charts.vitaminas = new Chart($('chartVitaminas'), {
    type: 'bar',
    data: { labels, datasets: [{ data: dias.map((d) => vit[d.key] || 0), backgroundColor: s.ambar, ...BAR }] },
    options: baseOpts({ callbacks: { label: (c) => ` ${c.parsed.y} gotas` } }),
  });

  const heces = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.heces ? 1 : 0));
  const orina = sumarPorDia(cache.panales, 'fecha_hora', (r) => (r.orina ? 1 : 0));
  const optsPan = baseOpts();
  optsPan.scales.x.stacked = true;
  optsPan.scales.y.stacked = true;
  optsPan.plugins.legend = {
    display: true,
    position: 'top',
    labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, color: cssVar('--text-2'), font: { size: 11 } },
  };
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

  const sueno = {};
  (cache.sueno || []).forEach((r) => tramosPorDia(r).forEach((t) => { sueno[t.key] = (sueno[t.key] || 0) + t.mins; }));
  charts.sueno = new Chart($('chartSueno'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: dias.map((d) => Math.round(((sueno[d.key] || 0) / 60) * 10) / 10), backgroundColor: s.violeta, ...BAR }],
    },
    options: baseOpts({ callbacks: { label: (c) => ` ${fmtDur(c.parsed.y * 60)}` } }),
  });
}

// ----- Modo diario: línea por hora de los últimos 3 días, con zoom/pan -----
function baseOptsDiario(ini, fin, labelFn) {
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
        callbacks: {
          title: (items) =>
            new Date(items[0].parsed.x).toLocaleString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
          label: labelFn,
        },
      },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
        pan: { enabled: true, mode: 'x' },
        limits: { x: { min: ini, max: fin, minRange: 3600000 } },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: ini,
        max: fin,
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: muted,
          font: { size: 11 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          stepSize: 6 * 3600000,
          callback: (v) => {
            const d = new Date(v);
            return d.getHours() === 0
              ? d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
              : d.getHours() + 'h';
          },
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

function renderChartsDiario() {
  const s = SERIES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
  const iniD = new Date(); iniD.setHours(0, 0, 0, 0);
  const ini = iniD.getTime() - 2 * 86400000; // desde el inicio de hace 2 días
  const fin = iniD.getTime() + 86400000;     // hasta el fin de hoy
  const enRango = (t) => { const ms = new Date(t).getTime(); return ms >= ini && ms <= fin; };
  const puntos = (rows, campo, val) =>
    (rows || [])
      .filter((r) => enRango(r[campo]))
      .map((r) => ({ x: new Date(r[campo]).getTime(), y: val(r) }))
      .sort((a, b) => a.x - b.x);

  charts.leche = new Chart($('chartLeche'), {
    type: 'line',
    data: { datasets: [{ data: puntos(cache.tomas, 'fecha_hora', (r) => r.cantidad_ml), borderColor: s.azul, backgroundColor: s.azul, ...LINEA }] },
    options: baseOptsDiario(ini, fin, (c) => ` ${c.parsed.y} ml`),
  });

  charts.vitaminas = new Chart($('chartVitaminas'), {
    type: 'line',
    data: { datasets: [{ data: puntos(cache.vitaminas, 'fecha_hora', (r) => r.gotas), borderColor: s.ambar, backgroundColor: s.ambar, ...LINEA }] },
    options: baseOptsDiario(ini, fin, (c) => ` ${c.parsed.y} gotas`),
  });

  // Pañales: conteo acumulado de eventos en los 3 días (escalones)
  const acumulado = (cond) => {
    let n = 0;
    return (cache.panales || [])
      .filter((r) => enRango(r.fecha_hora) && cond(r))
      .map((r) => new Date(r.fecha_hora).getTime())
      .sort((a, b) => a - b)
      .map((t) => ({ x: t, y: ++n }));
  };
  const optsPan = baseOptsDiario(ini, fin, (c) => ` ${c.dataset.label}: ${c.parsed.y} acumulado`);
  optsPan.plugins.legend = {
    display: true,
    position: 'top',
    labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, color: cssVar('--text-2'), font: { size: 11 } },
  };
  charts.panales = new Chart($('chartPanales'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Orina', data: acumulado((r) => r.orina), borderColor: s.azul, backgroundColor: s.azul, ...LINEA, stepped: 'before', tension: 0, pointRadius: 3 },
        { label: 'Heces', data: acumulado((r) => r.heces), borderColor: s.ambar, backgroundColor: s.ambar, ...LINEA, stepped: 'before', tension: 0, pointRadius: 3 },
      ],
    },
    options: optsPan,
  });

  charts.sueno = new Chart($('chartSueno'), {
    type: 'line',
    data: {
      datasets: [{
        data: puntos((cache.sueno || []).filter((r) => r.fin), 'inicio', (r) => Math.round((duracionMin(r) / 60) * 10) / 10),
        borderColor: s.violeta, backgroundColor: s.violeta, ...LINEA,
      }],
    },
    options: baseOptsDiario(ini, fin, (c) => ` ${fmtDur(c.parsed.y * 60)}`),
  });
}

// ---------- Tabs ----------
function renderTab(tab) {
  if (tab === 'stats') { if (statsDirty) renderCharts(); }
  else if (tab === 'leche') renderLeche();
  else if (tab === 'vitaminas') renderVitaminas();
  else if (tab === 'pastillas') renderPastillas();
  else if (tab === 'info') renderInfo();
  else if (tab === 'bitacora') renderBitacora();
  else if (tab === 'controles') renderControles();
  else if (tab === 'panales') renderPanales();
  else if (tab === 'sueno') renderSueno();
}

const TAB_META = {
  stats:     { icon: '📊', label: 'Stats' },
  leche:     { icon: '🍼', label: 'Leche' },
  vitaminas: { icon: '💊', label: 'Vitaminas' },
  pastillas: { icon: '💊', label: 'Pastillas' },
  panales:   { icon: '🧷', label: 'Pañales' },
  sueno:     { icon: '😴', label: 'Sueño' },
  info:      { icon: '👶', label: 'Info' },
  bitacora:  { icon: '📓', label: 'Bitácora' },
  controles: { icon: '🩺', label: 'Controles' },
};
const ORDEN_DEFAULT = ['stats', 'leche', 'vitaminas', 'panales', 'pastillas', 'info', 'bitacora', 'controles', 'sueno'];
const BAR_COUNT = 4; // primeras N pestañas en la barra, el resto en el menú "Más"

// Orden guardado por usuario (localStorage), completado con pestañas nuevas
function ordenTabs() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('orden_tabs') || '[]'); } catch { saved = []; }
  const orden = saved.filter((t) => TAB_META[t]);
  for (const t of ORDEN_DEFAULT) if (!orden.includes(t)) orden.push(t);
  return orden;
}
function guardarOrden(orden) { localStorage.setItem('orden_tabs', JSON.stringify(orden)); }

function renderTabbar() {
  const orden = ordenTabs();
  const btn = (t, cls) => `<button class="tab-btn ${cls}" data-tab="${t}"><span>${TAB_META[t].icon}</span>${TAB_META[t].label}</button>`;
  const bar = orden.slice(0, BAR_COUNT).map((t) => btn(t, '')).join('');
  const menu = orden.slice(BAR_COUNT).map((t) => btn(t, 'tab-menu-item')).join('');
  $('tabbar').innerHTML =
    bar +
    `<button class="tab-btn" id="masBtn" type="button"><span>⋯</span>Más</button>` +
    `<div id="masMenu" class="tab-menu hidden">${menu}</div>`;
  document.querySelectorAll('#tabbar .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
}

function activarTab(tab) {
  if (!TAB_META[tab]) tab = 'stats';
  currentTab = tab;
  localStorage.setItem('tab', tab);
  document.querySelectorAll('#tabbar .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
}

// Delegación de clicks de la barra (se rearma sola al reordenar)
document.addEventListener('click', (e) => {
  const tb = e.target.closest('.tab-btn');
  if (tb) {
    if (tb.id === 'masBtn') { e.stopPropagation(); $('masMenu').classList.toggle('hidden'); return; }
    if (tb.dataset.tab) { activarTab(tb.dataset.tab); $('masMenu')?.classList.add('hidden'); renderTab(currentTab); }
    return;
  }
  $('masMenu')?.classList.add('hidden'); // click fuera cierra el menú
});

// Reordenar pestañas (en Configuración)
function renderOrdenUI() {
  const orden = ordenTabs();
  $('ordenTabsUI').innerHTML = orden.map((t, i) =>
    `<div class="orden-row">
       <span>${TAB_META[t].icon} ${TAB_META[t].label}${i < BAR_COUNT ? ' · barra' : ''}</span>
       <span class="orden-btns">
         <button type="button" class="icon-btn orden-up" data-tab="${t}" ${i === 0 ? 'disabled' : ''}>▲</button>
         <button type="button" class="icon-btn orden-down" data-tab="${t}" ${i === orden.length - 1 ? 'disabled' : ''}>▼</button>
       </span>
     </div>`
  ).join('');
}

$('ordenTabsUI').addEventListener('click', (e) => {
  const b = e.target.closest('.orden-up, .orden-down');
  if (!b) return;
  const orden = ordenTabs();
  const i = orden.indexOf(b.dataset.tab);
  const j = b.classList.contains('orden-up') ? i - 1 : i + 1;
  if (j < 0 || j >= orden.length) return;
  [orden[i], orden[j]] = [orden[j], orden[i]];
  guardarOrden(orden);
  renderOrdenUI();
  renderTabbar();
});

// Recargar la app: botón manual + automático cada 5 minutos
$('reloadBtn').addEventListener('click', () => location.reload());
setInterval(() => {
  if (document.querySelector('.modal:not(.hidden)')) return; // no recargar con un modal abierto
  location.reload();
}, 300000);

// ---------- Formularios ----------
$('formLeche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cantidad = Number($('lecheCantidad').value);
  if (!(cantidad > 0)) { toast('La cantidad debe ser mayor a 0', true); return; }
  const ok = await insertar('tomas', {
    fecha_hora: new Date().toISOString(),
    cantidad_ml: Math.round(cantidad),
  });
  if (ok) { $('lecheCantidad').value = ''; renderLeche(); }
});

$('objetivoInput').addEventListener('change', () => {
  const v = Number($('objetivoInput').value);
  localStorage.setItem('objetivo_leche', v > 0 ? v : 800);
  renderLecheResumen();
});

// Guarda cambios en la ficha del bebé y refresca el objeto local
async function actualizarBebe(cambios) {
  const { error } = await db.from('bebes').update(cambios).eq('id', bebe.id);
  if (error) { toast(`Error: ${error.message}`, true); return false; }
  bebe = { ...bebe, ...cambios };
  return true;
}

$('lataInput').addEventListener('change', async () => {
  const v = Number($('lataInput').value);
  await actualizarBebe({ lata_gramos: v > 0 ? v : 800 });
  renderLecheResumen();
});

$('abrirLataBtn').addEventListener('click', async () => {
  const val = $('lataAbiertaInput').value;
  const fecha = val ? new Date(val) : new Date();
  const ok = await actualizarBebe({ lata_abierta_en: fecha.toISOString(), latas_usadas: (bebe?.latas_usadas || 0) + 1 });
  if (ok) { toast('Lata nueva abierta ✓'); renderLecheResumen(); }
});

$('formPastillas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('pastNombre').value.trim();
  if (!nombre) { toast('Escribe el nombre de la pastilla', true); return; }
  const ok = await insertar('pastillas', { nombre, horario: $('pastHorario').value });
  if (ok) { $('pastNombre').value = ''; renderPastillas(); }
});

$('formVitaminas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gotas = Number($('vitGotas').value);
  if (!(gotas > 0)) { toast('Las gotas deben ser mayores a 0', true); return; }
  const ok = await insertar('vitaminas', {
    fecha_hora: toISO($('vitFecha').value, $('vitHora').value),
    gotas: Math.round(gotas),
  });
  if (ok) { setNowDefaults(); $('vitGotas').value = 5; renderVitaminas(); }
});

$('formPanales').addEventListener('submit', async (e) => {
  e.preventDefault();
  // Sin checkboxes marcados también es válido: fue un cambio sin heces ni orina
  const heces = $('panHeces').checked, orina = $('panOrina').checked;
  const ok = await insertar('panales', {
    fecha_hora: new Date().toISOString(),
    heces, orina,
  });
  if (ok) { $('panHeces').checked = false; $('panOrina').checked = false; renderPanales(); }
});

$('formSueno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = $('suenoFecha').value;
  const inicio = new Date(`${fecha}T${$('suenoInicio').value}`);
  let fin = new Date(`${fecha}T${$('suenoFin').value}`);
  if (fin <= inicio) fin = new Date(fin.getTime() + 86400000); // cruzó la medianoche
  const ok = await insertar('sueno', { inicio: inicio.toISOString(), fin: fin.toISOString() });
  if (ok) { setNowDefaults(); renderSueno(); }
});

// ---------- Edición de registros ----------
let editRegistro = null; // { tabla, id }

const EDIT_TITULOS = { tomas: 'Editar toma', vitaminas: 'Editar vitaminas', pastillas: 'Editar pastilla', panales: 'Editar cambio de pañal', sueno: 'Editar sueño', bitacora: 'Editar anotación' };

function abrirEdicion(tabla, id) {
  const r = (cache[tabla] || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  editRegistro = { tabla, id: r.id };
  $('editTitulo').textContent = EDIT_TITULOS[tabla] || 'Editar registro';
  const f = (d) => dayKey(new Date(d));
  const h = (d) => fmtTime(new Date(d));
  let html;
  if (tabla === 'sueno') {
    html = `
      <label>Fecha (se durmió)<input type="date" id="edFecha" value="${f(r.inicio)}"></label>
      <div class="fila-2">
        <label>Se durmió<input type="time" id="edInicio" value="${h(r.inicio)}"></label>
        <label>Despertó<input type="time" id="edFin" value="${r.fin ? h(new Date(r.fin)) : ''}"></label>
      </div>
      <p class="form-hint">Si la hora de despertar es menor, se asume que cruzó la medianoche.${r.fin ? '' : ' Deja "Despertó" vacío si sigue durmiendo.'}</p>`;
  } else if (tabla === 'pastillas') {
    html = `
      <label>Nombre<input type="text" id="edPastNombre" maxlength="60" value="${escapeHtml(r.nombre || '')}"></label>
      <label>Horario<select id="edPastHorario">
        <option value="am"${r.horario === 'am' ? ' selected' : ''}>AM</option>
        <option value="pm"${r.horario === 'pm' ? ' selected' : ''}>PM</option>
      </select></label>`;
  } else if (tabla === 'bitacora') {
    html = `
      <label>Título<input type="text" id="edBitTitulo" maxlength="80" value="${escapeHtml(r.titulo || '')}"></label>
      <label>Fecha<input type="date" id="edBitFecha" value="${r.fecha}"></label>
      <label>Anotaciones<textarea id="edBitNotas" rows="3" maxlength="1000">${escapeHtml(r.notas || '')}</textarea></label>`;
  } else {
    html = `
      <div class="fila-2">
        <label>Fecha<input type="date" id="edFecha" value="${f(r.fecha_hora)}"></label>
        <label>Hora<input type="time" id="edHora" value="${h(r.fecha_hora)}"></label>
      </div>`;
    if (tabla === 'tomas')
      html += `<label>Cantidad (ml)<input type="number" id="edCantidad" step="any" inputmode="decimal" value="${r.cantidad_ml}"></label>`;
    if (tabla === 'vitaminas')
      html += `<label>Gotas<input type="number" id="edGotas" step="any" inputmode="decimal" value="${r.gotas}"></label>`;
    if (tabla === 'panales')
      html += `
      <div class="check-row">
        <label class="check-pill"><input type="checkbox" id="edHeces" ${r.heces ? 'checked' : ''}> 💩 Heces</label>
        <label class="check-pill"><input type="checkbox" id="edOrina" ${r.orina ? 'checked' : ''}> 💧 Orina</label>
      </div>`;
  }
  $('editCampos').innerHTML = html;
  $('editModal').classList.remove('hidden');
}

$('editClose').addEventListener('click', () => $('editModal').classList.add('hidden'));
$('editModal').addEventListener('click', (e) => { if (e.target === $('editModal')) $('editModal').classList.add('hidden'); });

$('editGuardar').addEventListener('click', async () => {
  if (!editRegistro) return;
  const { tabla, id } = editRegistro;
  const cambios = {};
  if (tabla === 'sueno') {
    const inicio = new Date(`${$('edFecha').value}T${$('edInicio').value}`);
    let fin = null;
    if ($('edFin').value) {
      fin = new Date(`${$('edFecha').value}T${$('edFin').value}`);
      if (fin <= inicio) fin = new Date(fin.getTime() + 86400000); // cruzó la medianoche
    }
    cambios.inicio = inicio.toISOString();
    cambios.fin = fin ? fin.toISOString() : null;
  } else if (tabla === 'pastillas') {
    const nombre = $('edPastNombre').value.trim();
    if (!nombre) { toast('Escribe el nombre de la pastilla', true); return; }
    cambios.nombre = nombre;
    cambios.horario = $('edPastHorario').value;
  } else if (tabla === 'bitacora') {
    const titulo = $('edBitTitulo').value.trim();
    if (!titulo) { toast('Escribe un título', true); return; }
    cambios.titulo = titulo;
    cambios.fecha = $('edBitFecha').value;
    cambios.notas = $('edBitNotas').value.trim() || null;
  } else {
    cambios.fecha_hora = toISO($('edFecha').value, $('edHora').value);
    if (tabla === 'tomas') {
      const v = Number($('edCantidad').value);
      if (!(v > 0)) { toast('La cantidad debe ser mayor a 0', true); return; }
      cambios.cantidad_ml = Math.round(v);
    }
    if (tabla === 'vitaminas') {
      const v = Number($('edGotas').value);
      if (!(v > 0)) { toast('Las gotas deben ser mayores a 0', true); return; }
      cambios.gotas = Math.round(v);
    }
    if (tabla === 'panales') {
      cambios.heces = $('edHeces').checked;
      cambios.orina = $('edOrina').checked;
    }
  }
  const { error } = await db.from(tabla).update(cambios).eq('id', id);
  if (error) { toast(`Error al guardar: ${error.message}`, true); return; }
  $('editModal').classList.add('hidden');
  await loadData(tabla);
  statsDirty = true;
  toast('Registro actualizado ✓');
  renderTab(currentTab);
});

// ---------- Tema (dark/light) ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('tema', theme);
  $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0d0d0d' : '#f9f9f7';
  if (appStarted) { statsDirty = true; if (currentTab === 'stats') renderCharts(); }
  if (bgTipo !== 'none' && !bgRaf) bgDibujar(); // refresca colores del fondo pausado
}

$('themeBtn').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ---------- Configuración (bebé: nombre, foto, paleta, código; mi rol) ----------
function calcularEdad(fechaNac) {
  const nac = new Date(fechaNac + 'T12:00');
  const hoy = new Date();
  let anios = hoy.getFullYear() - nac.getFullYear();
  let meses = hoy.getMonth() - nac.getMonth();
  let dias = hoy.getDate() - nac.getDate();
  if (dias < 0) { meses--; dias += new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate(); }
  if (meses < 0) { anios--; meses += 12; }
  if (anios >= 1) return `${anios}a ${meses}m`;
  if (meses >= 1) return `${meses}m ${dias}d`;
  return `${dias}d`;
}

function aplicarBebe() {
  $('babyName').textContent = bebe?.nombre || 'Mi bebé';
  document.documentElement.dataset.palette = bebe?.paleta || 'celeste';
  const img = $('babyPhoto'), fb = $('avatarFallback');
  if (bebe?.foto_base64) { img.src = bebe.foto_base64; img.classList.remove('hidden'); fb.classList.add('hidden'); }
  else { img.classList.add('hidden'); fb.classList.remove('hidden'); }
  const badge = $('rolBadge');
  badge.textContent = miRol === 'padre' ? '👨 Padre' : '👩 Madre';
  badge.classList.toggle('hidden', !miRol);

  const stats = [];
  if (bebe?.fecha_nacimiento) {
    const [y, m, d] = bebe.fecha_nacimiento.split('-');
    stats.push(`🎂 ${d}-${m}-${y} (${calcularEdad(bebe.fecha_nacimiento)})`);
  }
  if (bebe?.peso_kg) stats.push(`⚖️ ${bebe.peso_kg} kg`);
  if (bebe?.talla_cm) stats.push(`📏 ${bebe.talla_cm} cm`);
  $('babyStats').textContent = stats.join(' · ');
  $('babyStats').classList.toggle('hidden', !stats.length);
}

function abrirModal() {
  fotoPendiente = bebe?.foto_base64;
  $('cfgNombre').value = bebe?.nombre || '';
  $('cfgNacimiento').value = bebe?.fecha_nacimiento || '';
  $('cfgPeso').value = bebe?.peso_kg ?? '';
  $('cfgTalla').value = bebe?.talla_cm ?? '';
  $('cfgCodigo').textContent = bebe?.codigo || '——————';
  const rolInput = document.querySelector(`input[name="cfgRol"][value="${miRol}"]`);
  if (rolInput) rolInput.checked = true;
  actualizarPreviewFoto();
  marcarSwatch(bebe?.paleta || 'celeste');
  renderOrdenUI();
  $('settingsModal').classList.remove('hidden');
}

function cerrarModal() {
  $('settingsModal').classList.add('hidden');
  document.documentElement.dataset.palette = bebe?.paleta || 'celeste'; // revierte paleta no guardada
}

$('copiarCodigo').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(bebe?.codigo || '');
    toast('Código copiado ✓');
  } catch {
    toast('No se pudo copiar el código', true);
  }
});

function actualizarPreviewFoto() {
  const img = $('cfgFotoPreview'), fb = $('cfgAvatarFallback');
  if (fotoPendiente) { img.src = fotoPendiente; img.classList.remove('hidden'); fb.classList.add('hidden'); }
  else { img.classList.add('hidden'); fb.classList.remove('hidden'); }
}

function marcarSwatch(paleta) {
  document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s.dataset.palette === paleta));
}

$('settingsBtn').addEventListener('click', abrirModal);
$('settingsClose').addEventListener('click', cerrarModal);
$('settingsModal').addEventListener('click', (e) => { if (e.target === $('settingsModal')) cerrarModal(); });

$('swatchRow').addEventListener('click', (e) => {
  const sw = e.target.closest('.swatch');
  if (!sw) return;
  marcarSwatch(sw.dataset.palette);
  document.documentElement.dataset.palette = sw.dataset.palette; // vista previa inmediata
});

$('cfgFotoBtn').addEventListener('click', () => $('cfgFoto').click());

$('cfgFoto').addEventListener('change', () => {
  const file = $('cfgFoto').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Redimensiona a 256px máx y comprime para guardar como base64
      const escala = Math.min(1, 256 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      fotoPendiente = canvas.toDataURL('image/jpeg', 0.82);
      actualizarPreviewFoto();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

$('cfgGuardar').addEventListener('click', async () => {
  const cambios = {
    nombre: $('cfgNombre').value.trim() || 'Mi bebé',
    foto_base64: fotoPendiente || null,
    paleta: document.querySelector('.swatch.selected')?.dataset.palette || 'celeste',
    fecha_nacimiento: $('cfgNacimiento').value || null,
    peso_kg: Number($('cfgPeso').value) > 0 ? Number($('cfgPeso').value) : null,
    talla_cm: Number($('cfgTalla').value) > 0 ? Number($('cfgTalla').value) : null,
  };
  const rolSel = document.querySelector('input[name="cfgRol"]:checked')?.value || miRol;
  const [rBebe, rRol] = await Promise.all([
    db.from('bebes').update(cambios).eq('id', bebe.id),
    db.from('miembros').update({ rol: rolSel }).eq('user_id', usuario.id),
  ]);
  const error = rBebe.error || rRol.error;
  if (error) { toast(`Error al guardar: ${error.message}`, true); return; }
  bebe = { ...bebe, ...cambios };
  miRol = rolSel;
  aplicarBebe();
  $('settingsModal').classList.add('hidden');
  toast('Configuración guardada ✓');
});

$('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  $('settingsModal').classList.add('hidden');
});

// ---------- Info del bebé + padres ----------
let infoFotoPendiente;

function infoResumenTexto() {
  const partes = [];
  if (bebe?.fecha_nacimiento) {
    const [y, m, d] = bebe.fecha_nacimiento.split('-');
    partes.push(`🎂 ${d}-${m}-${y} (${calcularEdad(bebe.fecha_nacimiento)})`);
  }
  if (bebe?.peso_kg) partes.push(`⚖️ ${bebe.peso_kg} kg`);
  if (bebe?.talla_cm) partes.push(`📏 ${bebe.talla_cm} cm`);
  if (bebe?.grupo_sanguineo) partes.push(`🩸 ${bebe.grupo_sanguineo}`);
  return partes.join(' · ');
}

function renderInfo() {
  infoFotoPendiente = bebe?.foto_base64;
  const img = $('infoFotoPreview'), fb = $('infoAvatarFallback');
  if (infoFotoPendiente) { img.src = infoFotoPendiente; img.classList.remove('hidden'); fb.classList.add('hidden'); }
  else { img.classList.add('hidden'); fb.classList.remove('hidden'); }
  $('infoNombre').value = bebe?.nombre || '';
  $('infoNombreCompleto').value = bebe?.nombre_completo || '';
  $('infoGrupo').value = bebe?.grupo_sanguineo || '';
  $('infoNacimiento').value = bebe?.fecha_nacimiento || '';
  $('infoPeso').value = bebe?.peso_kg ?? '';
  $('infoTalla').value = bebe?.talla_cm ?? '';
  $('infoAlergias').value = bebe?.alergias || '';
  $('infoRutinas').value = bebe?.rutinas || '';
  $('infoResumen').textContent = infoResumenTexto();
}

$('infoFotoBtn').addEventListener('click', () => $('infoFoto').click());
$('infoFoto').addEventListener('change', () => {
  const file = $('infoFoto').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      const escala = Math.min(1, 256 / Math.max(im.width, im.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(im.width * escala);
      canvas.height = Math.round(im.height * escala);
      canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
      infoFotoPendiente = canvas.toDataURL('image/jpeg', 0.82);
      const img = $('infoFotoPreview'), fb = $('infoAvatarFallback');
      img.src = infoFotoPendiente; img.classList.remove('hidden'); fb.classList.add('hidden');
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
});

$('formInfo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cambios = {
    nombre: $('infoNombre').value.trim() || 'Mi bebé',
    nombre_completo: $('infoNombreCompleto').value.trim() || null,
    grupo_sanguineo: $('infoGrupo').value || null,
    fecha_nacimiento: $('infoNacimiento').value || null,
    peso_kg: Number($('infoPeso').value) > 0 ? Number($('infoPeso').value) : null,
    talla_cm: Number($('infoTalla').value) > 0 ? Number($('infoTalla').value) : null,
    alergias: $('infoAlergias').value.trim() || null,
    rutinas: $('infoRutinas').value.trim() || null,
    foto_base64: infoFotoPendiente || null,
  };
  const ok = await actualizarBebe(cambios);
  if (!ok) return;
  aplicarBebe();       // refresca la barra superior
  renderInfo();
  toast('Datos guardados ✓');
});

// Modal de padre / madre (contacto)
function abrirParent(rol) {
  const m = (cache.miembros || []).find((x) => x.rol === rol);
  $('parentTitulo').textContent = rol === 'padre' ? '👨 Padre' : '👩 Madre';
  const propio = m && m.user_id === usuario.id;
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

// ---------- Bitácora ----------
function renderBitacora() {
  if (!$('bitFecha').value) $('bitFecha').value = dayKey(new Date());
  const rows = cache.bitacora || []; // ordenadas por fecha desc
  $('bitLista').innerHTML = rows.length
    ? rows.map((r) => `
      <div class="bit-item">
        <div class="bit-head"><strong>${escapeHtml(r.titulo)}</strong><span>${fmtDayLabel(r.fecha)}</span></div>
        ${r.notas ? `<p>${escapeHtml(r.notas)}</p>` : ''}
        <div class="bit-acciones">${botonesEdit('bitacora', r.id)}</div>
      </div>`).join('')
    : '<p class="empty-msg">Sin anotaciones todavía</p>';
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

// ---------- Controles médicos ----------
const CONTROLES_SCHED = ['Díada (7-10 días)', '1 mes', '2 meses', '3 meses', '4 meses', '5 meses', '6 meses', '8 meses', '12 meses (primer año)'];
let ctrlEditId = null;

function limpiarControlForm() {
  ctrlEditId = null;
  $('ctrlSubmit').textContent = 'Guardar control';
  ['ctrlProfesional', 'ctrlEdad', 'ctrlPeso', 'ctrlTalla', 'ctrlPerimetro', 'ctrlDxNutri', 'ctrlDx', 'ctrlIndicaciones'].forEach((id) => { $(id).value = ''; });
  document.querySelectorAll('.ctrl-alim').forEach((c) => { c.checked = false; });
  $('ctrlControl').selectedIndex = 0;
  $('ctrlFecha').value = dayKey(new Date());
}

function renderControles() {
  if (!$('ctrlControl').options.length) $('ctrlControl').innerHTML = CONTROLES_SCHED.map((c) => `<option>${c}</option>`).join('');
  if (!$('ctrlFecha').value) $('ctrlFecha').value = dayKey(new Date());
  const rows = cache.controles || [];
  $('ctrlLista').innerHTML = rows.length
    ? rows.map((r) => {
        const linea = [r.edad && `Edad: ${escapeHtml(r.edad)}`, r.peso_kg && `Peso: ${r.peso_kg} kg`, r.talla_cm && `Talla: ${r.talla_cm} cm`, r.perimetro_craneal && `PC: ${r.perimetro_craneal} cm`, r.alimentacion && `Alim: ${escapeHtml(r.alimentacion)}`].filter(Boolean).join(' · ');
        return `
        <div class="bit-item">
          <div class="bit-head"><strong>${escapeHtml(r.control || 'Control')}</strong><span>${fmtDayLabel(r.fecha)}</span></div>
          ${linea ? `<p class="ctrl-detalle">${linea}</p>` : ''}
          ${r.diagnostico_nutricional ? `<p>Dx nutricional: ${escapeHtml(r.diagnostico_nutricional)}</p>` : ''}
          ${r.diagnostico ? `<p>Dx: ${escapeHtml(r.diagnostico)}</p>` : ''}
          ${r.indicaciones ? `<p>Indicaciones: ${escapeHtml(r.indicaciones)}</p>` : ''}
          ${r.profesional ? `<p class="ctrl-prof">👩‍⚕️ ${escapeHtml(r.profesional)}</p>` : ''}
          <div class="bit-acciones">${botonesEdit('controles', r.id)}</div>
        </div>`;
      }).join('')
    : '<p class="empty-msg">Sin controles todavía</p>';
}

function cargarControl(id) {
  const r = (cache.controles || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  ctrlEditId = r.id;
  $('ctrlSubmit').textContent = 'Actualizar control';
  const opt = [...$('ctrlControl').options].findIndex((o) => o.value === r.control);
  $('ctrlControl').selectedIndex = opt >= 0 ? opt : 0;
  $('ctrlProfesional').value = r.profesional || '';
  $('ctrlFecha').value = r.fecha || dayKey(new Date());
  $('ctrlEdad').value = r.edad || '';
  $('ctrlPeso').value = r.peso_kg ?? '';
  $('ctrlTalla').value = r.talla_cm ?? '';
  $('ctrlPerimetro').value = r.perimetro_craneal ?? '';
  $('ctrlDxNutri').value = r.diagnostico_nutricional || '';
  $('ctrlDx').value = r.diagnostico || '';
  $('ctrlIndicaciones').value = r.indicaciones || '';
  const alim = (r.alimentacion || '').split(',');
  document.querySelectorAll('.ctrl-alim').forEach((c) => { c.checked = alim.includes(c.value); });
  $('formControles').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('formControles').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valores = {
    control: $('ctrlControl').value,
    profesional: $('ctrlProfesional').value.trim() || null,
    fecha: $('ctrlFecha').value || dayKey(new Date()),
    edad: $('ctrlEdad').value.trim() || null,
    peso_kg: Number($('ctrlPeso').value) > 0 ? Number($('ctrlPeso').value) : null,
    talla_cm: Number($('ctrlTalla').value) > 0 ? Number($('ctrlTalla').value) : null,
    perimetro_craneal: Number($('ctrlPerimetro').value) > 0 ? Number($('ctrlPerimetro').value) : null,
    diagnostico_nutricional: $('ctrlDxNutri').value.trim() || null,
    diagnostico: $('ctrlDx').value.trim() || null,
    indicaciones: $('ctrlIndicaciones').value.trim() || null,
    alimentacion: [...document.querySelectorAll('.ctrl-alim:checked')].map((c) => c.value).join(',') || null,
  };
  if (ctrlEditId) {
    const { error } = await db.from('controles').update(valores).eq('id', ctrlEditId);
    if (error) { toast(`Error: ${error.message}`, true); return; }
    await loadData('controles');
    toast('Control actualizado ✓');
  } else {
    const ok = await insertar('controles', valores);
    if (!ok) return;
  }
  limpiarControlForm();
  renderControles();
});

// ---------- Autenticación ----------
let modoRegistro = false;

// Recordar credenciales (opt-in; contraseña en texto plano en este dispositivo)
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
      // Whitelist: solo correos autorizados pueden crear cuenta
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

// ---------- Vincular bebé (crear o unirse con código) ----------
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

// ---------- Entrada a la app ----------
async function entrar(session) {
  usuario = session.user;
  $('authScreen').classList.add('hidden');
  const { data: miembro, error } = await db.from('miembros').select('*').eq('user_id', usuario.id).maybeSingle();
  if (error) { toast(`Error: ${error.message}`, true); return; }
  if (!miembro) {
    // Aún no está vinculado a ningún bebé
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
  activarTab(localStorage.getItem('tab') || 'stats'); // recuerda la pestaña tras recargar
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

// ---------- Fondo animado (mar / espacio) ----------
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
      const brillo = 0.55 + 0.45 * Math.sin(bgT * 1.5 + e.f); // titileo suave
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
    if (bgPausado) bgDibujar(); // cuadro estático
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

// ---------- Inicio ----------
applyTheme(localStorage.getItem('tema') || 'dark');
bgResize();
aplicarFondo();
actualizarSegUI();
renderTabbar();
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
