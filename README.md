# NebuAppWeb 🍼

App web móvil colaborativa para registrar las rutinas de un bebé: tomas de leche, vitaminas, cambios de pañal, sueño, bitácora y juegos de estimulación, con estadísticas interactivas configurables (1 día, 7 días, 14 días y 1 mes) y cálculo automático de tarros de fórmula abiertos. HTML + CSS + Vanilla JS, sin herramientas de compilación (`zero-build`) — lista para GitHub Pages.

---

## Configuración (una sola vez)

### 1. Crear el proyecto en Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de [`supabase.sql`](supabase.sql) y ejecuta **Run**. Esto crea las tablas activas (`bebes`, `miembros`, `whitelist`, `tomas`, `vitaminas`, `vitaminas_tipos`, `vitaminas_tipos_log`, `panales`, `sueno`, `bitacora`, `juegos`), las funciones y las políticas de RLS: **solo los padres vinculados a un bebé pueden ver y escribir sus datos**.

> **Si tu base de datos ya tenía datos y versiones anteriores**: ejecuta [`actualizacion-10.sql`](actualizacion-10.sql) en el SQL Editor para eliminar las tablas y dependencias de módulos obsoletos (pastillas, controles, supermercado y compras).

### 2. Conectar la app
Las credenciales viven en `config.js`, que **no se sube al repo** (está en `.gitignore`).

- **Local**: copia [`config.example.js`](config.example.js) como `config.js` y pega tu **Project URL** y **anon public key** (Supabase → **Project Settings → API**).
- **GitHub Pages**: el workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) genera `config.js` al desplegar usando los Secrets del repo. Configúralos en **Settings → Secrets and variables → Actions → New repository secret**:
  - `SUPABASE_URL` → `https://tu-proyecto.supabase.co`
  - `SUPABASE_ANON_KEY` → tu anon/publishable key

### 3. Usuarios, whitelist y vinculación
La app requiere iniciar sesión, y **solo los correos en la whitelist pueden registrarse** (un trigger en PostgreSQL lo bloquea).

- **Autorizar un correo** (SQL Editor):
  ```sql
  insert into whitelist (email) values ('correo@ejemplo.com');
  ```

**Flujo de vinculación**:
1. Un padre/madre crea al bebé y recibe un **código único** de 6 caracteres (visible en ⚙️ con botón para compartir por WhatsApp o copiar).
2. El otro progenitor entra con su cuenta, elige su rol (👩/👨) y se une con ese código (máximo 2 padres por bebé).
3. Ambos comparten y sincronizan los datos en tiempo real bajo aislamiento RLS.

---

## Módulos y Uso

- **📊 Stats (Estadísticas Interactivas)**:
  - Selector de rangos de tiempo: **1 día**, **7 días**, **14 días** y **1 mes** (30 días).
  - Alternancia individual entre gráfico de **Barras 📊** y **Línea 📈** por cada métrica.
  - Zoom táctil (pinch / rueda de mouse) y paneo interactivo con botón de restablecimiento (`⟲`).
- **🍼 Leche**:
  - Registro rápido de tomas con objetivo diario y barra de progreso.
  - Tiempo transcurrido desde la última toma.
  - **Cálculo de Tarros de Fórmula**: cálculo histórico automático del número de tarros abiertos/usados según el total acumulado de ml ingeridos (4,3 g por cada 30 ml), peso configurable del tarro (ej. 800 g), gramos restantes y porcentaje de uso del tarro en curso.
- **💊 Vitaminas**:
  - Lista de vitaminas por nombre con checklist diario (fecha/hora y dosis).
  - Registro rápido de dosis sueltas (gotas).
- **🧷 Pañales**:
  - Registro distinguiendo heces y/u orina.
  - Contador de tiempo desde el último cambio y fecha de la última feca.
- **😴 Sueño**:
  - Horas de dormir y despertar con cálculo de duración y soporte para cruce de medianoche.
  - Botón de siesta activa en vivo (*"Se durmió"* / *"Despertó"*).
- **👶 Info del Bebé y Padres**:
  - Ficha médica y de desarrollo: peso, talla, edad exacta calculada, grupo sanguíneo, alergias y rutinas.
  - Datos de contacto de los padres y preguntas frecuentes (FAQ).
  - Botones directos para compartir código de vinculación vía **Web Share API** y **WhatsApp**.
- **📖 Bitácora**:
  - Registro cronológico de hitos, recuerdos y anotaciones.
- **🧸 Juegos y Estimulación**:
  - Temporizador / cronómetro con persistencia, álbum fotográfico de la sesión y notas de observación.
- **📂 Historiales Optimizados**:
  - Agrupación colapsable multinivel: semanas del mes para el mes en curso y colapso mensual para meses anteriores terminados.
- **⚙️ Configuración y Personalización**:
  - 5 paletas de colores (*Celeste, Rosa, Verde, Lila, Ámbar*), modo oscuro/claro independiente por dispositivo y fondos animados en `<canvas>`.
  - Reorganización personalizable del orden de pestañas de la barra inferior.
