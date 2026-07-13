# NebuAppWeb 🍼

App web móvil para registrar las rutinas de un bebé: tomas de leche, vitaminas, cambios de pañal y sueño, con estadísticas de los últimos 7 días. HTML + CSS + Vanilla JS, sin build tools — lista para GitHub Pages.

## Configuración (una sola vez)

### 1. Crear el proyecto en Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de [`supabase.sql`](supabase.sql) y ejecuta **Run**. Esto crea las tablas (`bebes`, `miembros`, `whitelist`, `tomas`, `vitaminas`, `panales`, `sueno`), las funciones y el RLS: **solo los padres vinculados a un bebé pueden ver y escribir sus datos**.

> **Si tu base ya existía con el esquema anterior** (tabla `config`, datos sin bebé): ejecuta [`migracion.sql`](migracion.sql) UNA sola vez en lugar de `supabase.sql`. Conserva todos los registros, los asigna a un bebé nuevo y vincula a los usuarios existentes (quedan como "madre" por defecto — cada uno corrige su rol en ⚙️).

### 2. Conectar la app
Las credenciales viven en `config.js`, que **no se sube al repo** (está en `.gitignore`).

- **Local**: copia [`config.example.js`](config.example.js) como `config.js` y pega tu **Project URL** y **anon public key** (Supabase → **Project Settings → API**).
- **GitHub Pages**: el workflow [`deploy.yml`](.github/workflows/deploy.yml) genera `config.js` al desplegar usando los Secrets del repo. Configúralos en **Settings → Secrets and variables → Actions → New repository secret**:
  - `SUPABASE_URL` → `https://tu-proyecto.supabase.co`
  - `SUPABASE_ANON_KEY` → tu anon/publishable key

> Nota: la anon key igualmente es visible en el navegador de quien use la app (es una clave pública por diseño); la protección real de los datos es el RLS + login.

### 3. Usuarios, whitelist y vinculación
La app requiere iniciar sesión, y **solo los correos en la whitelist pueden registrarse** (un trigger en la base lo bloquea, incluso desde el Dashboard). Los usuarios ya existentes no se ven afectados.

- **Autorizar un correo** (SQL Editor):
  ```sql
  insert into whitelist (email) values ('correo@ejemplo.com');
  ```
- **Registro desde la app**: por defecto Supabase pide confirmar el email; para registro inmediato desactívalo en **Authentication → Providers → Email → Confirm email**.

**Flujo de vinculación** (después del primer login):
1. Un padre/madre elige su rol (👩/👨), crea al bebé y recibe un **código único** (visible en ⚙️, con botón Copiar).
2. El otro entra con su cuenta, elige su rol y se une con ese código (máximo 2 padres por bebé).
3. Desde ahí ambos comparten los datos del bebé; **nadie más puede verlos** (RLS por `bebe_id`).

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
