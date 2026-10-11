# Protocolo de Trabajo y Directorio de Proyectos

## 1. Regla del Disparador "Lista"
Cada vez que el usuario escriba la palabra **`Lista`** (o solicite saber en qué proyectos trabajar):
1. **Desplegar de inmediato el Checklist / Selector de Proyectos** listado a continuación.
2. **Consultar al usuario** en cuál de los proyectos se va a trabajar en esta sesión.
3. Una vez que el usuario seleccione o indique el proyecto objetivo:
   - Establecer el contexto activo (rutas locales, rutas en el servidor `rektressserver`, puertos y repositorios).
   - Dirigir todas las modificaciones de código, pruebas, despliegues y comandos exclusivamente a dicho proyecto.

---

## 2. Directorio Maestro de Proyectos del Servidor (`rektressserver`)

| ID | Proyecto | Ruta Local (PC) | Ruta Servidor (`100.70.40.7`) | Contenedores / Servicios | Puertos | Descripción |
|---|---|---|---|---|---|---|
| **1** | **NebuAppWeb / WhatsApp Gateway** | `C:\Users\Matteo\Documents\Espacio de trabajo\NebuAppWeb` | `/home/matteo_admin/whatsapp-gateway` | `evolution-api`, `evolution-postgres`, `evolution-redis`, `cron (informe_diario.py)` | `8080` (API), `5432`, `6379` | PWA de rutina de bebé + gateway Baileys Evolution API para alertas y reportes diarios automáticos por WhatsApp. |
| **2** | **RC Estampa** | `C:\Users\Matteo\Documents\Espacio de trabajo\RC Estampa` | `/home/matteo_admin/rc-estampa` | `rc_estampa_frontend`, `rc_estampa_backend`, `rc_estampa_db` | `80` (Web), `8000` (API), `5432` (PG) | Plataforma de gestión y catálogo web para estampados. React + FastAPI + PostgreSQL. |
| **3** | **Servidor Status Dashboard** | `C:\Users\Matteo\Documents\Espacio de trabajo\Servidor\servidor-status-dashboard` | `/home/matteo_admin/servidor-status-dashboard` | `servidor-status-dashboard` | `4000` (Web + API) | Dashboard interactivo interno con visualización de topología, monitoreo de salud de servicios, Docker y métricas en tiempo real. |
| **4** | **Pila de Observabilidad** | N/A (Admin Servidor) | `/home/matteo_admin/observabilidad` | `observabilidad-grafana-1`, `observabilidad-prometheus`, `observabilidad-loki-1`, `observabilidad-node-exporter`, `observabilidad-promtail-1` | `3000` (Grafana), `9090` (Prometheus), `3100` (Loki), `9100` (Metrics) | Stack de telemetría, métricas de host, visualización gráfica y agregación de logs del sistema Linux. |
| **5** | **Portfolio Web** | `C:\Users\Matteo\Documents\Espacio de trabajo\Portfolio_MateoAraneda` | `/home/matteo_admin/portfolio` | Aplicación web en Node.js | Local / Servidor | Sitio web personal y portafolio profesional de Mateo Araneda. |
| **6** | **Contact API** | N/A | `/home/matteo_admin` | `contact-api-contact-api-1` | `3050 -> 3000` | Microservicio backend para recepción de formularios de contacto y envío transaccional de correos. |
| **7** | **Portainer CE** | N/A | `/home/matteo_admin` | `portainer` | `9443` (HTTPS), `8000`, `9000` | Interfaz gráfica web para administración y orquestación de contenedores, imágenes y redes Docker. |
| **8** | **GitHub Actions Runner** | N/A | `/home/matteo_admin/actions-runner` | Runner autoalojado de GitHub Actions (servicio systemd) | N/A | Agente de CI/CD para compilación, ejecución de pipelines y despliegues automatizados en el servidor. |
| **9** | **Orion Project** | `C:\Users\Matteo\Documents\Espacio de trabajo\Orion_Project` | `/home/matteo_admin/backups_orion_final` | Redes Docker `orion_preprod_orion_net`, `orionproducciones_orion_net` | Variable | Proyecto y servicios de producción/preproducción Orion con respaldos programados. |
| **10** | **Servidor / Diagnóstico SRE** | `C:\Users\Matteo\Documents\Espacio de trabajo\Servidor` | `/home/matteo_admin` | Scripts de diagnóstico (`diag.sh`), logs de hardware, kernel y reinicios | N/A | Scripts de administración, guías de operación y soporte SRE de la infraestructura del servidor Ubuntu. |

---

## 3. Regla Obligatoria de Entrega y Reporte (Flujo del Proyecto)
Antes de dar cualquier tarea por entregada, es obligatorio:
1. **Verificación en GitHub / CI:** Validar que el código esté en la rama remota y que los pipelines de integración continua (GitHub Actions) hayan finalizado con éxito (`conclusion: success`). Si hay errores, se debe iterar y corregir antes de dar por terminada la tarea.
2. **Despliegue y verificación en vivo:** Validar que los servicios en producción estén operativos (contenedores activos y respuestas HTTP correctas).
3. **Estructura del reporte punto por punto (5 secciones obligatorias):**
   - **Qué se solicitó:** Detalle de los requerimientos y alcances pedidos.
   - **Cómo se encontraba la app:** Diagnóstico técnico, errores detectados y análisis de causa raíz.
   - **Qué solución se implementó:** Estrategia técnica y decisiones adoptadas.
   - **Cómo se implementó:** Modificaciones específicas por archivo, componentes, hooks y configuraciones (con enlaces de archivo en formato `file://` y barras inclinadas `/`).
   - **Cómo quedó luego de implementado:** Validación de funcionamiento, pruebas y verificación en GitHub Actions / CI y producción.
