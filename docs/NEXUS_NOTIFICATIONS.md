# NEXUS — Email Notifications for Reminders

Reminders (`Reminder.remindAt`) can now actually email you when they're
due — created by voice/text through NexusBrain ("avisame mañana a las 9
que llame al dentista") or from `/reminders` directly. This is **optional**,
same pattern as `AI_API_KEY` and Google Calendar: without it configured,
reminders still get created and show up in the app, they just don't
trigger an email.

## Por qué necesita dos cosas separadas (no es capricho)

1. **Enviar el mail en sí** — necesita un proveedor de email
   ([Resend](https://resend.com), gratis hasta 100 mails/día).
2. **Que alguien le avise al servidor "che, revisá si hay recordatorios
   vencidos"** — Render (plan gratis) no tiene cron propio, y el servicio
   se duerme a los 15 minutos sin uso. La solución: este mismo repositorio
   ya tiene un lugar gratis para correr algo cada 5 minutos — GitHub
   Actions — así que un workflow (`.github/workflows/dispatch-reminders.yml`)
   le hace ping al servidor cada 5 minutos, lo cual también lo despierta
   si estaba dormido.

## Paso a paso

### 1. Resend (el envío de mails)

1. Creá una cuenta gratis en [resend.com](https://resend.com).
2. Dashboard → API Keys → creá una → copiala.
3. Sin hacer nada más, ya podés enviar mails desde `onboarding@resend.dev`
   (el sandbox de Resend) a cualquier dirección — no hace falta verificar
   un dominio propio para probarlo. Si más adelante querés que los mails
   salgan de tu propio dominio, Resend te guía para verificarlo, y ahí
   cambiás `RESEND_FROM_EMAIL`.

### 2. Variables en Render

En el dashboard de tu servicio → Environment, agregá:

- `RESEND_API_KEY`: la que copiaste en el paso 1.
- `RESEND_FROM_EMAIL` (opcional): dejalo vacío para usar el sandbox de
  Resend, o poné algo como `NEXUS <nexus@tudominio.com>` si ya verificaste
  un dominio propio.
- `INTERNAL_DISPATCH_SECRET`: inventate cualquier string random y largo
  (por ejemplo, generalo con `openssl rand -hex 32` en una terminal, o
  cualquier generador de contraseñas). Es una contraseña que solo tu
  propio GitHub Actions va a usar para autenticarse contra tu servidor —
  guardala, la necesitás en el paso 3 también, **tiene que ser exactamente
  la misma en los dos lugares**.

### 3. Secrets en GitHub (para que el ping automático funcione)

En este repositorio: Settings → Secrets and variables → Actions → New
repository secret. Agregá dos:

- `NEXUS_APP_URL`: la URL pública de tu Nexus desplegado, sin barra al
  final (ej. `https://nexus.onrender.com`).
- `INTERNAL_DISPATCH_SECRET`: el mismo valor exacto que pusiste en Render
  en el paso 2.

### 4. Probarlo

- Andá a la pestaña **Actions** de este repo → "Dispatch reminder emails"
  → "Run workflow" (el botón de correr manualmente, no hace falta esperar
  los 5 minutos).
- O simplemente creá un recordatorio para dentro de un minuto (por voz:
  "avisame en un minuto que estoy probando esto") y esperá.

Sin estas variables configuradas, el workflow corre igual cada 5 minutos
pero no hace nada (lo dice explícitamente en su log) — nunca rompe nada
del resto de la app.

## Qué NO hace (a propósito, no por descuido)

- No es instantáneo — el chequeo es cada 5 minutos, y GitHub Actions
  puede demorar los cron unos minutos más bajo carga alta de su
  plataforma. Para un recordatorio, unos minutos de margen no importan.
- No manda push notifications al teléfono — eso necesita un service
  worker + claves VAPID (PWA) o una build nativa con notificaciones push
  reales (app móvil), ninguna de las dos implementada todavía. Email es
  el canal que "simplemente funciona" en cualquier dispositivo sin pedir
  permisos del navegador.
