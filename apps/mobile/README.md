# NEXUS Mobile (Fase 7 — Native)

Expo/React Native app, same NEXUS backend as `apps/web` — no separate
server, no separate account, just `EXPO_PUBLIC_API_URL` pointed at the
same deployment.

## Por qué existe

La PWA no puede reconocer voz en iPhone: Safari (y cualquier navegador en
iOS, todos corren sobre WebKit) nunca implementó `SpeechRecognition`. Una
app nativa es el único camino real a "hablale y te escucha" en iPhone —
ver `docs/NEXUS_ROADMAP.md` Fase 2 para el detalle completo de esa
limitación.

## Estado inicial (V1)

Construido y probado (vía el target `--web` de Expo + un navegador real,
ya que este entorno de desarrollo no tiene Xcode/simulador):

- Auth completo: registro, login, logout — con `Authorization: Bearer`
  en vez de cookies (`apps/mobile/src/lib/api.ts`, `tokenStore.ts`), ya
  que un cliente nativo no tiene cookie jar de navegador. El backend
  (`apps/api/src/routes/auth.ts`) soporta ambos modos: cookies para la
  web, tokens en el body para mobile, detectado por el header
  `X-Nexus-Client: mobile` — nunca los dos a la vez para el mismo
  cliente, así la web nunca expone su token a JS (ver el comentario en
  `isMobileClient`).
- Today con salida de voz automática: NEXUS habla el resumen del día
  apenas carga la pantalla, sin tocar nada — pensado explícitamente para
  no sentirse como "una app con botones", sino como un secretario que ya
  te está hablando cuando abrís el teléfono. Tocar el Face lo repite.
- Face nativo (V1 visual simplificado — sin el shell 3D de la web
  todavía, ver "Pendiente" abajo).

## Cómo correrlo

```bash
cd apps/mobile
cp .env.example .env   # completar EXPO_PUBLIC_API_URL
npx expo start
```

Escaneá el QR con la app **Expo Go** (gratis, App Store/Play Store) desde
tu teléfono — no hace falta cuenta de Apple Developer para esto, ni para
probar en tu propio dispositivo durante desarrollo.

## Secretaria nativa (development build)

La app abre en **Inicio** y tiene una barra de pestañas (`src/app/(app)/_layout.tsx`, `expo-router/js-tabs`), todo detrás de un solo bloqueo biométrico:

| Pestaña | Archivo | Qué hace |
|---|---|---|
| **Inicio** | `(app)/home.tsx` | Consola de voz: al abrir ya escucha una frase, la manda a `POST /assistant/interpret` y resuelve en el teléfono lo que propone (ver abajo). Historial corto de la conversación. Si Nexus pregunta algo, vuelve a escuchar. Sin IA en el servidor (501) entiende frases de navegación («abrí pacientes», «dictar», «mi día», «agenda») y avisa que falta configurar la IA. |
| **Pacientes** | `(app)/patients/` | Lista con búsqueda por nombre o DNI, paginada (`GET /clinical/patients?q=&page=`); ficha con datos y consultas (folio, fecha, plantilla, estado, campos); «Dictar en esta ficha»; alta de paciente con teléfono desde el selector de contactos del sistema. |
| **Dictar** | `(app)/assistant.tsx` | Dictado clínico (plantilla `visit`): propone ficha, consulta, seguimientos y turnos con evidencia; nada se guarda hasta confirmar. Panel **Asistente clínico IA** (`POST /verticals/medicine/assist`): guías con fuentes, prevención, «Tu conducta habitual», sugerencias de IA marcadas «verificar» y «Qué se envió a la IA (sin nombre ni DNI)». Al confirmar, aprende la conducta (`habits/learn`). |
| **Mi día** | `(app)/day.tsx` | Turnos, vencidos, borradores y sugerencias, leídos en voz alta; ofrece el aviso diario. |
| **Agenda** | `(app)/agenda.tsx` | Próximos 7 días: turnos de Nexus (`GET /events`) junto con el calendario del teléfono (todas las cuentas). «Nuevo turno» lo crea en Nexus y lo copia al teléfono. |

`Today` y `Ajustes` (voz, hora del resumen diario, cerrar sesión) existen como rutas sin pestaña (engranaje en Inicio).

### Qué resuelve Inicio en el teléfono

- **Alarma** (`alarm`): en Android abre el Reloj con `ACTION_SET_ALARM` (hora, minutos, etiqueta, sin pantalla; `expo-intent-launcher`, permiso `SET_ALARM`). Si falta más de un día, o en iPhone (no hay API pública para el Reloj), programa una notificación local con sonido a esa hora y lo dice. El servidor guarda además el recordatorio.
- **Turno** (`event`): lo agrega al calendario por defecto del teléfono (`expo-calendar`; en Android, el principal con escritura) y dice «Agendado en tu calendario».
- **Mail** (`emailDraft`): tarjeta con destinatario, asunto y cuerpo. «Enviar» aparece solo si el borrador quedó en Gmail con su token, y se envía únicamente con ese toque (`POST /google-workspace/drafts/:id/send`).
- **Navegación / derivación**: `/patients` → Pacientes, `/patients/capture` → Dictar con el texto ya cargado, `/patients/day` → Mi día, `/calendar` → Agenda, con una confirmación corta en voz.

### Voz de salida (`src/lib/voice.ts`)

Si `GET /voice/status` dice `configured`, reproduce el MP3 de `POST /voice/tts` con `expo-audio` (escrito en el caché con `expo-file-system` y borrado al terminar). Si no, `expo-speech` con la mejor voz en español del teléfono (calidad Enhanced/Premium primero; es-AR > es-419 > es-US > es-MX > es-ES). El silencio se guarda en `expo-secure-store`. El micrófono espera a que Nexus termine de hablar.

### Notificaciones (`src/lib/notifications.ts`)

Locales, sin push. El permiso se pide recién al activar el resumen diario o una alarma en iPhone. Resumen de «Mi día» a la hora que elijas (8:00 por defecto); el texto nunca lleva nombres ni datos clínicos. Tocar el aviso abre Mi día.

### Permisos

`app.json` se genera desde el manifiesto de la vertical (`pnpm --filter @nexus/verticals native medicine`) y una prueba falla si se desincroniza. Implementados: micrófono, reconocimiento de voz, contactos (selector), biometría, calendario (lectura y escritura) y notificaciones (+ `SET_ALARM` en Android). Cámara y fotos siguen *planificados*. Las cabeceras `X-Nexus-Owner` (id del usuario) viajan en `/clinical/`, `/verticals/` y `/google-workspace/` igual que en la web.

### Development build con EAS

Expo Go no trae estos módulos nativos (reconocimiento de voz, calendario, intent launcher, etc.):

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure          # crea eas.json la primera vez
npx eas-cli@latest build --profile development --platform android   # o ios
npx expo start --dev-client                 # y abrís el build instalado
```

En iPhone, el perfil `development` necesita registrar el dispositivo (`npx eas-cli@latest device:create`) y una cuenta de Apple Developer. Con Android alcanza instalar el APK.

### Verificado en este entorno (sin dispositivo)

`pnpm --filter @nexus/mobile lint`, `typecheck`, `pnpm --filter @nexus/verticals test`, `expo export --platform ios` y `--platform android`, y `expo config --type introspect` (Info.plist con los textos de micrófono, voz, contactos, Face ID, calendario y recordatorios; Android con calendario, notificaciones y `SET_ALARM`).

### Necesita un teléfono real para probarse

Dictado y escucha automática en Inicio, voz neural y voz del sistema, alarma en el Reloj de Android (varía según la app de Reloj), aviso con sonido en iPhone, alta y lectura del calendario, resumen diario, selector de contactos y Face ID / huella.

## Pendiente (en orden)

1. **Probar el development build en un iPhone y un Android reales** — el
   dictado ya está integrado (`expo-speech-recognition`), pero falta
   validarlo en dispositivo. La cuenta de Apple Developer ($99/año) recién
   hace falta para TestFlight o App Store.
2. **Face 3D real** — hoy es un círculo plano con ojos; el shell de
   cristal rotando de la web (`apps/web/.../NexusFace.tsx`, CSS
   `preserve-3d`) no tiene equivalente directo en React Native sin una
   dependencia 3D/Skia.
3. **Integración con el sistema operativo** — Siri Shortcuts / App
   Intents, widgets de pantalla de inicio o bloqueo, Live Activities.
   Todo esto también necesita un development build, no Expo Go puro.
4. Memoria, Proyectos, Áreas e Inbox todavía no tienen pantalla nativa
   (Pacientes, Dictar, Mi día y Agenda sí).
