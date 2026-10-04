# Nexus — Guía de despliegue (web y app nativa)

Esta guía es para poner Nexus en producción sin conocimientos técnicos previos. Seguí los pasos en orden.

---

## Parte 1 — Web en Render (lo que ya usás)

### 1.1 Lo que ya está andando

- Render toma la rama `main` del repositorio y despliega solo (Blueprint `render.yaml`).
- Una sola dirección (`https://<tu-servicio>.onrender.com`) sirve la web y la API, y la base PostgreSQL vive en Render.

### 1.2 Variables de entorno

Se cargan en Render → tu servicio `nexus` → **Environment** → *Add Environment Variable* → **Save Changes**. Render redepliega solo.

| Variable | Para qué | Cómo conseguirla |
|---|---|---|
| `GEMINI_API_KEY` | Sugerencias clínicas con IA y asistente que entiende frases | [Google AI Studio](https://aistudio.google.com/apikey) → *Create API key*. En el plan gratuito Google puede usar los datos para mejorar sus productos: Nexus solo envía casos sin nombre, DNI ni teléfono. |
| `AI_PROVIDER` + `AI_API_KEY` + `AI_MODEL` | Pasar a Claude más adelante | En [console.anthropic.com](https://console.anthropic.com): `AI_PROVIDER=anthropic`, `AI_API_KEY=<clave>`, `AI_MODEL=claude-haiku-4-5` (o el modelo que elijas). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Gmail, Google Calendar, Contactos y Drive | Ver 1.3. |
| `VOICE_PROVIDER`, `VOICE_API_KEY`, `VOICE_NAME` | Voz neural (opcional) | `google` (Cloud Text-to-Speech), `elevenlabs` u `openai`. Sin esto se usa la voz del celular. |
| `RESEND_API_KEY`, `INTERNAL_DISPATCH_SECRET` | Recordatorios por correo (opcional) | Ver `docs/NEXUS_NOTIFICATIONS.md`. |

> **No cambies `AUTH_SECRET` ni agregues `CLINICAL_DATA_KEY`** si ya cargaste pacientes. De esa clave salen las claves que cifran las fichas, y cambiarla las vuelve ilegibles. Si querés una clave clínica propia, hacelo con un proceso de recifrado y una copia de seguridad antes.

### 1.3 Conectar Gmail y Google Calendar (una vez)

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) → crear proyecto «Nexus».
2. **APIs y servicios → Biblioteca**: habilitá *Gmail API*, *Google Calendar API*, *People API* y *Google Drive API*.
3. **Pantalla de consentimiento OAuth**: tipo *Externo*; agregá tu correo como *usuario de prueba*.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - *URI de redireccionamiento autorizado*: `https://<tu-servicio>.onrender.com/api/connectors/google/callback`.
5. Copiá el *ID de cliente* y el *secreto* a Render (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y en `GOOGLE_REDIRECT_URI` pegá exactamente la URI del paso 4.
6. En Nexus: **Ajustes → Google → Conectar con permisos de Gmail y Calendar**. Si ya estaba conectado, desconectá y volvé a conectar para dar el permiso nuevo de escritura en el calendario.

La conexión queda en tu cuenta de Nexus: **la app del celular la usa automáticamente**, no hay que repetirla.

### 1.4 Cosas importantes del plan gratuito de Render

- El servicio se duerme a los 15 minutos sin uso; la primera vez tarda 30 a 60 segundos en responder.
- **La base gratuita de Render vence a los 90 días.** Antes de usar Nexus con pacientes reales, pasá la base a un plan pago (Render → `nexus-db` → *Upgrade*) o a Neon. Hacé copias con `scripts/backup.mjs` (ver `docs/NEXUS_WEB_RELEASE.md`).
- El proyecto de Vercel `nexus-api` que aparece en GitHub falla desde siempre y no es tu despliegue. Podés desconectarlo en Vercel → *Settings → Git → Disconnect*.

### 1.5 Instalar la web como app en el celular (mientras no tengas la nativa)

- **iPhone (Safari)**: abrí tu dirección de Render → botón Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar aplicación*.
- El micrófono funciona en Chrome (Android/PC) y en Safari con Siri activado. Para alarmas, calendario del teléfono y contactos hace falta la app nativa (Parte 2).

---

## Parte 2 — App nativa (iPhone y Android)

La app nativa está en `apps/mobile` (Expo). Se conecta a la misma Nexus de Render y agrega todo lo que una web no puede:

| Del teléfono | Qué hace Nexus |
|---|---|
| Micrófono y reconocimiento de voz | Dictado continuo con botón grande; en el dispositivo cuando se puede |
| Reloj / alarmas | **Android**: crea la alarma en la app Reloj. **iPhone**: Apple no deja a otras apps crear alarmas del Reloj; Nexus programa un aviso con sonido a esa hora. |
| Calendario del teléfono | Copia los turnos (solo iniciales del paciente) y muestra tus eventos en Agenda |
| Notificaciones | Resumen diario de «Mi día» y avisos, sin nombres de pacientes |
| Contactos | Selector del sistema para completar teléfonos |
| Face ID / huella | Bloquea las fichas |
| Gmail / Google Calendar | Por la conexión de Google hecha una vez en la web (1.3) |

### 2.1 Lo que necesitás

- Una cuenta gratuita en [expo.dev](https://expo.dev/signup).
- **Android**: nada más. Se instala un archivo `.apk` directo.
- **iPhone**: una cuenta de **Apple Developer** (US$ 99 por año, [developer.apple.com/programs](https://developer.apple.com/programs/)). Sin ella, iOS no deja instalar apps propias fuera de la App Store.
- Una computadora con Node.js 20 o más (Windows, Mac o Linux). No hace falta Xcode ni Android Studio: EAS compila en la nube.

### 2.2 Preparar el proyecto (una sola vez)

```bash
git clone https://github.com/drmarianojimenez94-sudo/Nexus.git
cd Nexus
corepack enable && pnpm install
cd apps/mobile
npx eas-cli@latest login            # tu usuario de expo.dev
npx eas-cli@latest init             # vincula el proyecto a tu cuenta
```

1. En `apps/mobile/eas.json`, reemplazá **las dos** apariciones de `https://REEMPLAZAR-POR-TU-NEXUS.onrender.com` por tu dirección de Render.
2. En `apps/mobile/app.json`, cambiá `ios.bundleIdentifier` y `android.package` (hoy `com.nexus.app`, que seguramente ya existe) por uno propio, por ejemplo `com.tuapellido.nexus`. Usá solo minúsculas, números y puntos.

### 2.3 Android: generar e instalar

```bash
npx eas-cli@latest build --profile preview --platform android
```

Cuando termina (10 a 20 minutos), EAS muestra un enlace y un código QR. Abrilo desde el celular, descargá el `.apk` e instalalo. Android te va a pedir permitir *instalar apps de origen desconocido* para el navegador. Listo: aparece el ícono de Nexus.

### 2.4 iPhone: generar e instalar

```bash
npx eas-cli@latest device:create      # registra tu iPhone: abrí el enlace en el iPhone y seguí los pasos
npx eas-cli@latest build --profile preview --platform ios
```

EAS te pide iniciar sesión con tu Apple ID de desarrollador y crea los certificados solo. Al terminar, abrí el enlace del build desde el iPhone → *Instalar*. En iOS 16 o superior, activá **Ajustes → Privacidad y seguridad → Modo de desarrollador** la primera vez.

### 2.5 Primer uso en el teléfono (dar permisos)

1. Abrí Nexus e iniciá sesión con tu misma cuenta de la web.
2. Tocá el **botón grande del micrófono** y aceptá *Micrófono* y *Reconocimiento de voz*.
3. Dictá «agendame ateneo mañana a las 10» y aceptá *Calendario*.
4. Dictá «poneme una alarma mañana a las 6:30» y aceptá *Notificaciones*. En Android se abre el Reloj con la alarma creada.
5. En **Ajustes** de Nexus, elegí la hora del resumen diario.
6. Si negaste algún permiso por error, se reactiva en Ajustes del teléfono → Nexus.

### 2.6 Atajos para abrir Nexus hablando

- **iPhone**: app *Atajos* → nuevo atajo → *Abrir URL* → `nexus://` → nombre «Nexus dictar». Después decís «Oye Siri, Nexus dictar».
- **Android**: mantené apretado el ícono de Nexus y arrastrá el acceso directo a la pantalla de inicio, o usá «Ok Google, abrí Nexus».

### 2.7 Actualizar la app

- Cambios en Render (web y API): no hay que hacer nada; la app usa la API nueva al instante.
- Cambios en `apps/mobile`: repetí el `build` del paso 2.3 o 2.4 e instalá la versión nueva.

### 2.8 Publicar en las tiendas (cuando quieras)

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios       # App Store Connect (TestFlight)
npx eas-cli@latest submit --platform android   # Google Play Console (cuenta de US$ 25, pago único)
```

Para las tiendas hacen falta:
- la política de privacidad publicada (`docs/NEXUS_PRIVACY_POLICY.md`, revisada por un abogado);
- la declaración de app de salud en Google Play;
- el borrado de cuenta desde la app (pendiente).

---

## Parte 3 — Qué conviene probar en el teléfono el primer día

1. **Dictar una consulta completa con pausas largas**: debe seguir escuchando hasta que toques «Listo» o hasta la pausa que elijas en «Lo que aprendí → Cómo te escucho».
2. «Agendame un turno con la paciente Ana López el jueves a las 10» → debe aparecer en Agenda y en el calendario del teléfono.
3. «Poneme una alarma mañana a las 6:30» → Android: en el Reloj. iPhone: aviso con sonido.
4. «Mandale un mail a … pidiendo …» → borrador con botón «Enviar» (con Google conectado).
5. Validar una consulta y ver lo aprendido en **🧠 Lo que aprendí**.
