-- ============================================================
-- Actualización 11 — Soporte de Configuración de WhatsApp Gateway y Alertas Proactivas
-- Permite persistir y sincronizar la configuración de notificaciones
-- de WhatsApp compartida entre ambos padres en la tabla bebes.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table bebes add column if not exists whatsapp_config jsonb default '{
  "enabled": true,
  "apiUrl": "https://rektressserver.tailda85b3.ts.net:8443",
  "apiKey": "NebuAppWspKey_2026_Secure!",
  "instance": "nebuapp",
  "target": "120363414573336812@g.us, 56944830378, 56950192577",
  "notifyTomas": true,
  "notifyPanales": true,
  "notifyVitaminas": true,
  "notifySueno": true,
  "notifyAlertaHambre": true,
  "notifyAlertaVitaminas": true,
  "notifyAlertaFecas": true,
  "notifyAlertaSueno": true
}'::jsonb;
