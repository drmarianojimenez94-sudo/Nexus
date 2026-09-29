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

## Pendiente (en orden)

1. **Speech-to-text real** — el paso que de verdad resuelve "hablale y te
   escucha" en iPhone. Expo Go no trae un módulo nativo de reconocimiento
   de voz; hace falta un *development build* (`eas build --profile
   development`, gratis en el tier free de EAS) con
   `expo-speech-recognition` o similar. Sigue sin requerir una cuenta de
   Apple Developer para probar en tu propio teléfono — esa cuenta
   ($99/año) recién hace falta para publicar en la App Store o distribuir
   a otros dispositivos vía TestFlight.
2. **Face 3D real** — hoy es un círculo plano con ojos; el shell de
   cristal rotando de la web (`apps/web/.../NexusFace.tsx`, CSS
   `preserve-3d`) no tiene equivalente directo en React Native sin una
   dependencia 3D/Skia.
3. **Integración con el sistema operativo** — Siri Shortcuts / App
   Intents, widgets de pantalla de inicio o bloqueo, Live Activities.
   Todo esto también necesita un development build, no Expo Go puro.
4. Memoria, Proyectos, Áreas, Calendario, Inbox — hoy solo existe Today;
   el resto de las pantallas de la web todavía no tienen equivalente acá.
