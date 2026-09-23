-- ============================================================
-- Actualización 11 — Soporte de Configuración de WhatsApp Gateway
-- Permite persistir y sincronizar la configuración de notificaciones
-- de WhatsApp compartida entre ambos padres en la tabla bebes.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table bebes add column if not exists whatsapp_config jsonb default '{
  "enabled": false,
  "apiUrl": "https://rektressserver.tailda85b3.ts.net:8443",
  "apiKey": "NebuAppWspKey_2026_Secure!",
  "instance": "nebuapp",
  "target": "",
  "notifyTomas": true,
  "notifyPanales": true,
  "notifyVitaminas": true,
  "notifySueno": true
}'::jsonb;
