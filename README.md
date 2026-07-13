# NebuAppWeb 🍼

App web móvil para registrar las rutinas de un bebé: tomas de leche, vitaminas, cambios de pañal y sueño, con estadísticas de los últimos 7 días. HTML + CSS + Vanilla JS, sin build tools — lista para GitHub Pages.

## Configuración (una sola vez)

### 1. Crear el proyecto en Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de [`supabase.sql`](supabase.sql) y ejecuta **Run**. Esto crea las tablas `tomas`, `vitaminas`, `panales`, `sueno` y `config` con RLS (solo usuarios autenticados pueden leer/escribir).

### 2. Conectar la app
Las credenciales viven en `config.js`, que **no se sube al repo** (está en `.gitignore`).

- **Local**: copia [`config.example.js`](config.example.js) como `config.js` y pega tu **Project URL** y **anon public key** (Supabase → **Project Settings → API**).
- **GitHub Pages**: el workflow [`deploy.yml`](.github/workflows/deploy.yml) genera `config.js` al desplegar usando los Secrets del repo. Configúralos en **Settings → Secrets and variables → Actions → New repository secret**:
  - `SUPABASE_URL` → `https://tu-proyecto.supabase.co`
  - `SUPABASE_ANON_KEY` → tu anon/publishable key

> Nota: la anon key igualmente es visible en el navegador de quien use la app (es una clave pública por diseño); la protección real de los datos es el RLS + login.

### 3. Usuarios (login)
La app requiere iniciar sesión. Opciones:
- **Registro desde la app**: por defecto Supabase pide confirmar el email. Para registro inmediato, desactívalo en **Authentication → Providers → Email → Confirm email**.
- **Crear usuarios a mano** (recomendado para uso familiar): **Authentication → Users → Add user** con email y contraseña.

### 4. Publicar en GitHub Pages
1. Sube el repo a GitHub y configura los dos Secrets del paso 2.
2. **Settings → Pages → Source: GitHub Actions** (necesario para que el workflow despliegue).
3. Cada push a `main` despliega automáticamente. La app queda en `https://tu-usuario.github.io/NebuAppWeb/`.

## Uso
- **📊 Stats**: gráficos de barras de los últimos 7 días (leche, vitaminas, pañales, sueño).
- **🍼 Leche**: registro de tomas, total del día y objetivo diario con barra de progreso.
- **💊 Vitaminas**: registro de gotas (5 por defecto).
- **🧷 Pañales**: registro con heces/orina, tiempo desde el último cambio y última feca.
- **😴 Sueño**: hora de dormir/despertar con duración calculada (soporta cruce de medianoche).
- **⚙️ Configuración**: nombre y foto del bebé, color de la app (5 paletas) — se sincronizan entre dispositivos. Modo oscuro por defecto (botón ☀️/🌙, se guarda por dispositivo).
