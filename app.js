/* ============================================================
   Rutinas del Bebé — lógica de la app (Vanilla JS + Supabase)
   ============================================================ */

// Credenciales de Supabase: vienen de config.js (window.ENV).
// Local: copia config.example.js como config.js. GitHub Pages: se genera
// en el workflow de Actions desde los Secrets SUPABASE_URL / SUPABASE_ANON_KEY.
const ENV = window.ENV || {};
const configurado = ENV.SUPABASE_URL && !ENV.SUPABASE_URL.includes('TU-PROYECTO');

const db = supabase.createClient(
  configurado ? ENV.SUPABASE_URL : 'https://sin-configurar.supabase.co',
  ENV.SUPABASE_ANON_KEY || 'sin-configurar'
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
let cfg = { nombre_bebe: 'Mi bebé', foto_base64: null, paleta: 'celeste' };
let statsDirty = true;
let appStarted = false;
let currentTab = 'stats';
let fotoPendiente; // base64 elegido en el modal, aún sin guardar

// ---------- Datos ----------
async function fetchTable(tabla, campoOrden) {
  const { data, error } = await db.from(tabla).select('*').order(campoOrden, { ascending: false }).limit(500);
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

function renderCharts() {
  const dias = ultimos7Dias();
  const labels = dias.map((d) => d.label);
  const s = SERIES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
  const surface = cssVar('--surface');

  Object.values(charts).forEach((c) => c.destroy());

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

  statsDirty = false;
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
  const ok = await insertar('tomas', {
    fecha_hora: toISO($('lecheFecha').value, $('lecheHora').value),
    cantidad_ml: Number($('lecheCantidad').value),
  });
  if (ok) { $('lecheCantidad').value = ''; setNowDefaults(); renderLeche(); }
});

$('objetivoInput').addEventListener('change', () => {
  const v = Math.max(1, Number($('objetivoInput').value) || 800);
  localStorage.setItem('objetivo_leche', v);
  renderLecheResumen();
});

$('formVitaminas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = await insertar('vitaminas', {
    fecha_hora: toISO($('vitFecha').value, $('vitHora').value),
    gotas: Number($('vitGotas').value),
  });
  if (ok) { setNowDefaults(); $('vitGotas').value = 5; renderVitaminas(); }
});

$('formPanales').addEventListener('submit', async (e) => {
  e.preventDefault();
  const heces = $('panHeces').checked, orina = $('panOrina').checked;
  if (!heces && !orina) { toast('Marca Heces, Orina o ambas', true); return; }
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
}

$('themeBtn').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ---------- Configuración (nombre, foto, paleta) ----------
function applyConfig() {
  $('babyName').textContent = cfg.nombre_bebe || 'Mi bebé';
  document.documentElement.dataset.palette = cfg.paleta || 'celeste';
  const img = $('babyPhoto'), fb = $('avatarFallback');
  if (cfg.foto_base64) { img.src = cfg.foto_base64; img.classList.remove('hidden'); fb.classList.add('hidden'); }
  else { img.classList.add('hidden'); fb.classList.remove('hidden'); }
}

async function loadConfig() {
  const { data, error } = await db.from('config').select('*').eq('id', 1).maybeSingle();
  if (error) { toast(`Error cargando configuración: ${error.message}`, true); return; }
  if (data) cfg = data;
  applyConfig();
}

function abrirModal() {
  fotoPendiente = cfg.foto_base64;
  $('cfgNombre').value = cfg.nombre_bebe || '';
  actualizarPreviewFoto();
  marcarSwatch(cfg.paleta);
  $('settingsModal').classList.remove('hidden');
}

function cerrarModal() {
  $('settingsModal').classList.add('hidden');
  document.documentElement.dataset.palette = cfg.paleta || 'celeste'; // revierte paleta no guardada
}

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
  const nueva = {
    id: 1,
    nombre_bebe: $('cfgNombre').value.trim() || 'Mi bebé',
    foto_base64: fotoPendiente || null,
    paleta: document.querySelector('.swatch.selected')?.dataset.palette || 'celeste',
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('config').upsert(nueva);
  if (error) { toast(`Error al guardar: ${error.message}`, true); return; }
  cfg = nueva;
  applyConfig();
  $('settingsModal').classList.add('hidden');
  toast('Configuración guardada ✓');
});

$('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  $('settingsModal').classList.add('hidden');
});

// ---------- Autenticación ----------
let modoRegistro = false;

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
    $('authError').textContent = err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : err.message;
    $('authError').classList.remove('hidden');
  } finally {
    $('authSubmit').disabled = false;
  }
});

async function showApp() {
  $('authScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  if (appStarted) return;
  appStarted = true;
  setNowDefaults();
  renderLecheResumen();
  await Promise.all([loadConfig(), loadAll()]);
  renderTab(currentTab);
}

function showAuth() {
  appStarted = false;
  $('app').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
}

// ---------- Inicio ----------
applyTheme(localStorage.getItem('tema') || 'dark');

if (!configurado) {
  showAuth();
  $('authError').textContent = '⚠️ Falta config.js con SUPABASE_URL y SUPABASE_ANON_KEY (ver config.example.js)';
  $('authError').classList.remove('hidden');
} else {
  db.auth.onAuthStateChange((_evento, session) => {
    if (session) showApp();
    else showAuth();
  });
}
