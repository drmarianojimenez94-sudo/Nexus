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

## Estado (V1 — sin voz de entrada todavía)

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

## Vertical médica nativa (development build)

- **Abre en "Mi día"** (`src/app/(app)/day.tsx`): turnos, vencidos, resultados, borradores sin validar y sugerencias, leído en voz alta al entrar.
- **Asistente clínico** (`src/app/(app)/assistant.tsx`): al entrar ya escucha (modo "Dicto yo") con `expo-speech-recognition`, en el dispositivo cuando el sistema lo soporta, sin guardar audio. Modo "Con el paciente" exige confirmar el consentimiento antes de grabar. Propone ficha, borrador de consulta, seguimientos y turnos con la evidencia de cada dato; nada se guarda hasta confirmar.
- **Contactos**: selector del sistema (`Contact.presentPicker`) para completar el teléfono de un paciente nuevo; no lee la agenda completa.
- **Bloqueo biométrico** (`expo-local-authentication`): Face ID / huella / código antes de mostrar datos de pacientes, y otra vez tras 1 minuto en segundo plano.
- **Permisos**: `app.json` se genera desde el manifiesto de la vertical (`pnpm --filter @nexus/verticals native medicine`). Una prueba falla si se desincroniza. Cámara, fotos, calendario y notificaciones están declarados como *planificados* y no se piden todavía.

Necesita un development build (`npx eas-cli@latest build --profile development`), porque Expo Go no incluye estos módulos nativos. Verificado en este entorno: typecheck, lint, `expo export --platform ios` y `expo config --type introspect` (Info.plist con los cuatro textos de permiso). No se probó en un dispositivo físico.

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
4. Memoria, Proyectos, Áreas, Calendario, Inbox — hoy solo existe Today;
   el resto de las pantallas de la web todavía no tienen equivalente acá.
