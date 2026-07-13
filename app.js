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
  for (const id of ['lecheFecha', 'vitFecha', 'panFecha', 'suenoFecha']) $(id).value = f;
  for (const id of ['lecheHora', 'vitHora', 'panHora', 'suenoInicio', 'suenoFin']) $(id).value = h;
}

// ---------- Estado ----------
const cache = { tomas: null, vitaminas: null, panales: null, sueno: null };
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

async function loadData(tabla) {
  cache[tabla] = await fetchTable(tabla, tabla === 'sueno' ? 'inicio' : 'fecha_hora');
}

async function loadAll() {
  await Promise.all(['tomas', 'vitaminas', 'panales', 'sueno'].map(loadData));
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

// Delegación de clicks para los botones 🗑 de todas las tablas
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (btn) eliminar(btn.dataset.tabla, btn.dataset.id);
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

const delBtn = (tabla, id) =>
  `<td class="td-action"><button class="del-btn" data-tabla="${tabla}" data-id="${id}" title="Eliminar">🗑</button></td>`;

function renderLeche() {
  const rows = cache.tomas || [];
  $('tablaLeche').innerHTML = tablaHTML(
    ['Hora', 'Cantidad'],
    groupByDay(rows, 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.cantidad_ml} ml</td>${delBtn('tomas', r.id)}</tr>`,
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
}

function renderVitaminas() {
  $('tablaVitaminas').innerHTML = tablaHTML(
    ['Hora', 'Gotas'],
    groupByDay(cache.vitaminas || [], 'fecha_hora'),
    (r) => `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.gotas} gotas</td>${delBtn('vitaminas', r.id)}</tr>`
  );
}

function renderPanales() {
  const rows = cache.panales || [];
  $('tablaPanales').innerHTML = tablaHTML(
    ['Hora', 'Heces', 'Orina'],
    groupByDay(rows, 'fecha_hora'),
    (r) =>
      `<tr><td>${fmtTime(new Date(r.fecha_hora))}</td><td>${r.heces ? '💩 Sí' : '—'}</td><td>${r.orina ? '💧 Sí' : '—'}</td>${delBtn('panales', r.id)}</tr>`
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
setInterval(() => { if (appStarted && cache.panales) renderPanalesDash(); }, 60000);

function duracionMin(r) {
  return (new Date(r.fin) - new Date(r.inicio)) / 60000;
}

function renderSueno() {
  $('tablaSueno').innerHTML = tablaHTML(
    ['Inicio', 'Fin', 'Duración'],
    groupByDay(cache.sueno || [], 'inicio'),
    (r) =>
      `<tr><td>${fmtTime(new Date(r.inicio))}</td><td>${fmtTime(new Date(r.fin))}</td><td>${fmtDur(duracionMin(r))}</td>${delBtn('sueno', r.id)}</tr>`,
    (rs) => `Durmió: ${fmtDur(rs.reduce((s, r) => s + duracionMin(r), 0))}`
  );
}

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

  const sueno = sumarPorDia(cache.sueno, 'inicio', duracionMin);
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
        data: puntos(cache.sueno, 'inicio', (r) => Math.round((duracionMin(r) / 60) * 10) / 10),
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
  else if (tab === 'panales') renderPanales();
  else if (tab === 'sueno') renderSueno();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + currentTab));
    renderTab(currentTab);
  });
});

// ---------- Formularios ----------
$('formLeche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cantidad = Number($('lecheCantidad').value);
  if (!(cantidad > 0)) { toast('La cantidad debe ser mayor a 0', true); return; }
  const ok = await insertar('tomas', {
    fecha_hora: toISO($('lecheFecha').value, $('lecheHora').value),
    cantidad_ml: Math.round(cantidad),
  });
  if (ok) { $('lecheCantidad').value = ''; setNowDefaults(); renderLeche(); }
});

$('objetivoInput').addEventListener('change', () => {
  const v = Number($('objetivoInput').value);
  localStorage.setItem('objetivo_leche', v > 0 ? v : 800);
  renderLecheResumen();
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
    fecha_hora: toISO($('panFecha').value, $('panHora').value),
    heces, orina,
  });
  if (ok) { $('panHeces').checked = false; $('panOrina').checked = false; setNowDefaults(); renderPanales(); }
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
function aplicarBebe() {
  $('babyName').textContent = bebe?.nombre || 'Mi bebé';
  document.documentElement.dataset.palette = bebe?.paleta || 'celeste';
  const img = $('babyPhoto'), fb = $('avatarFallback');
  if (bebe?.foto_base64) { img.src = bebe.foto_base64; img.classList.remove('hidden'); fb.classList.add('hidden'); }
  else { img.classList.add('hidden'); fb.classList.remove('hidden'); }
  const badge = $('rolBadge');
  badge.textContent = miRol === 'padre' ? '👨 Padre' : '👩 Madre';
  badge.classList.toggle('hidden', !miRol);
}

function abrirModal() {
  fotoPendiente = bebe?.foto_base64;
  $('cfgNombre').value = bebe?.nombre || '';
  $('cfgCodigo').textContent = bebe?.codigo || '——————';
  const rolInput = document.querySelector(`input[name="cfgRol"][value="${miRol}"]`);
  if (rolInput) rolInput.checked = true;
  actualizarPreviewFoto();
  marcarSwatch(bebe?.paleta || 'celeste');
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

// ---------- Autenticación ----------
let modoRegistro = false;

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
