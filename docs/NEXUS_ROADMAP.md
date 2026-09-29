# NEXUS — Roadmap

Orden de construcción tal como lo pide el brief (§54): no todo a la vez.
Cada fase se apoya en la anterior sin reescribirla.

**Reordenado** respecto del plan original a pedido explícito del usuario:
Voice pasa a ser la prioridad inmediata después de Core (es lo que hace
que NEXUS se sienta como "hablarle a algo"), y se agrega **NEXUS Home**
dentro de la Fase 4 para conectar dispositivos smart home — con la
salvedad real de que esto se hace vía un hub (Home Assistant), no
Bluetooth directo desde el iPhone, porque iOS no lo permite (ver
[`NEXUS_CONNECTORS.md`](NEXUS_CONNECTORS.md)).

## ✅ Fase 1 — NEXUS Core (implementada)

- [x] Auth (registro, login, logout, refresh, `/auth/me`) con JWT +
      refresh en cookies httpOnly
- [x] Base de datos: 28 tablas diseñadas, migración inicial aplicada
- [x] Today (NOW, PRIORIDADES, TIMELINE, ATTENTION, INSIGHT — reglas
      simples, sin IA todavía), rediseñado como consola tipo HUD que
      despliega paneles alrededor del Face
- [x] Tasks (CRUD, subtareas, completar)
- [x] Projects (CRUD, hitos, detalle con tareas)
- [x] Areas (CRUD, sin hardcodear, con set sugerido opcional)
- [x] Calendar (eventos, agenda agrupada por día)
- [x] Inbox + Quick Capture (texto; desde Fase 2 el botón abre modo voz
      donde el navegador lo soporta, con el texto como fallback automático)
- [x] Preferencias sincronizadas por cuenta (`preferences`, no
      `localStorage`) — primer uso real: recordar si ya se vio el
      onboarding, entre dispositivos
- [x] **Onboarding**: tour de primera vez (`OnboardingTour.tsx`) que
      recorre Face/Quick Capture, Today, Inbox, Calendar, Projects/Areas
- [x] **Nexus Face**: reemplaza al Orb original — rostro abstracto (ojos
      + boca tipo ecualizador), seis estados, listo para que Voice lo
      alimente con audio real, con un shell 3D real (CSS `preserve-3d` +
      `perspective`) rotando alrededor
- [x] **Captura offline**: Quick Capture nunca pierde un pensamiento por
      falta de señal — se guarda en el teléfono (`localStorage`) y se
      sincroniza solo apenas vuelve la conexión
- [x] **Primera pieza real de IA**: el Insight de Today ahora lo puede
      generar Claude (Anthropic, vía `NexusAIProvider`) en vez de una
      regla fija, con fallback automático si no hay `AI_API_KEY` o si
      falla la llamada — ver [`NEXUS_AI_ARCHITECTURE.md`](NEXUS_AI_ARCHITECTURE.md)
- [x] **Panel de Bluetooth "mejor esfuerzo"** en Settings: emparejamiento
      directo donde el navegador lo soporta (Chrome/Edge desktop o
      Android — nunca iPhone, feature-detectado, no fingido)
- [x] PWA instalable (manifest, iconos, layout mobile-first)
- [x] Audit log en toda escritura
- [x] Tests automatizados del backend (16 tests, ver
      [`NEXUS_TEST_REPORT.md`](NEXUS_TEST_REPORT.md)), CI en GitHub Actions
- [x] Milestone funcional del brief §55 verificado manualmente
      (registro → Today → Quick Capture visible en Inbox → proyecto y
      tarea creados → persisten al recargar) con un smoke test de
      navegador real

**No incluido a propósito en Fase 1** (queda para su fase correspondiente,
no porque se haya olvidado): Memory, Command Center (Ctrl+K), vistas de
semana/mes del calendario, módulos de vida (Finanzas/Salud/Viajes/Formación).

## ✅ Fase 2 — NEXUS Voice V1/V1.5 (implementada, con límites reales)

- [x] Text-to-Speech (`window.speechSynthesis`, hook `useSpeech.ts`) — Today
      se puede escuchar ("🔊 Escuchar resumen") y el onboarding se narra solo
- [x] Speech-to-Text (`SpeechRecognition`/`webkitSpeechRecognition`,
      mismo hook) — funciona en Chrome/Edge desktop y Android
- [x] **Conversación continua con la app abierta (V1.5)**: tocás el Face
      (`VoiceSession.tsx`) y entra en loop escuchar → interpretar
      (`voiceCommands.ts`) → hablar la respuesta → volver a escuchar, hasta
      que decís "listo"/"gracias"/"chau" o cerrás
- [x] Router de comandos por voz (`handleVoiceCommand`): navegación
      ("llevame a inbox/calendario/proyectos/áreas"), resumen del día
      hablado, y cualquier otra frase cae en Quick Capture por voz
      (con cola offline si no hay señal, igual que el Quick Capture de texto)
- [x] Deep link `?listen=1` + entrada en el manifest PWA (`shortcuts`) para
      abrir directo en modo voz desde la pantalla de inicio o un Siri
      Shortcut — ver límite de "abrir hablando" más abajo
- [ ] Estados del Face conectados a nivel de amplitud de audio real (Web
      Audio API) — hoy la boca anima con un patrón fijo, no con la señal
- [ ] Wake word en foreground (V2, app abierta pero sin tocar nada)
- [ ] Parser de lenguaje natural real (hoy `voiceCommands.ts` es reglas +
      regex, no pasa por `NexusAIProvider` todavía — eso es Fase 3)

**Límites reales de la plataforma (no son bugs, son restricciones de iOS/Safari — WebKit no implementa estas APIs en ningún navegador de iPhone, ni Chrome ni Firefox, porque todos corren sobre WebKit ahí):**

- **Sin STT en iPhone**: `SpeechRecognition` no existe en iOS Safari. La app
  lo detecta (`sttSupported`) y cae automáticamente al Quick Capture de
  texto — nunca se rompe, pero en iPhone hoy **no hay** "hablale y te
  escucha" dentro de la PWA. Es la limitación más grande respecto de lo que
  pediste ("no quiero escribir ni una palabra") y no tiene solución dentro
  de una PWA — ver Fase 7 (cliente nativo) como único camino real.
- **TTS sí funciona en iPhone** (Safari soporta `speechSynthesis`), así que
  el resumen hablado y la narración del onboarding sí se escuchan ahí.
- **No existe "abrir la app hablándole al teléfono estando cerrada o con la
  pantalla bloqueada"**: ninguna PWA puede escuchar en background en iOS.
  El sustituto real es el deep link `?listen=1` + un **Siri Shortcut**
  ("Oye Siri, hablar con Nexus" → abre la URL) — la app se abre y entra en
  modo voz sola, pero *quien la abre es Siri*, no NEXUS escuchando de
  fondo. El atajo de iOS todavía hay que crearlo a mano una vez
  (Accesos Directos → nuevo atajo → "Abrir URL" → la URL de tu Nexus
  desplegado + `/today?listen=1` → activarlo por voz con Siri).
- **Gestos de cámara**: mencionado como posible, no arrancado — no forma
  parte de V1/V1.5.

## ⏳ Fase 3 — NEXUS Brain

- [x] **Memory V1**: visible/editable/buscable en `/memory`, CRUD completo
      (`apps/api/src/routes/memory.ts`), y accesible por voz — "recordá
      que…" guarda, "qué sabés/recordás sobre…" busca y lo dice en voz alta
      (`voiceCommands.ts`). Nunca una caja negra: todo lo que NEXUS
      recuerda se puede leer, editar y borrar desde la app.
- [x] Memory conectada al Insight de Today: `NexusAIProvider` recibe los
      últimos recuerdos como contexto y puede usarlos si son relevantes
      (`ai.ts`, `DailyInsightContext.recentMemories`) — solo cuando hay
      `AI_API_KEY` configurada, igual que el resto del Insight.
- [x] **Mapa conceptual 3D**: al navegar por voz, el Face ya no corta a la
      pantalla siguiente en seco — `ConceptMap.tsx` dibuja un anillo de
      "salas" (Hoy/Inbox/Calendario/Proyectos/Áreas/Memoria) alrededor
      del Face con profundidad real (`translateZ` + perspective), y la
      sala destino se ilumina mientras NEXUS habla, antes de navegar. Es
      la primera pieza de la idea de "avatar que te lleva por un mapa".
- [ ] `NexusAIProvider`: falta el resto de la interfaz (interfaz base ya
      documentada en [`NEXUS_AI_ARCHITECTURE.md`](NEXUS_AI_ARCHITECTURE.md))
- [ ] Context Engine real (resolución de persona/proyecto/área/fecha/confianza
      con IA, hoy `voiceCommands.ts` es reglas + regex, no NLU)
- [ ] Mapa conceptual con nodos dinámicos (Proyectos/Áreas reales del
      usuario en vez de las seis salas fijas) — V2 natural sobre lo ya
      construido
- [ ] Tools envolviendo los handlers REST existentes con permisos y
      confirmación
- [ ] Comandos multi-acción con plan explícito y manejo de fallos
- [ ] Deshacer acciones (usa `AiAction`, ya en el schema)

## ⏳ Fase 4 — NEXUS Connect (incluye NEXUS Home)

- [x] **Google Calendar** (primer conector real): OAuth 2.0 completo
      (`apps/api/src/routes/connectors.ts` + `lib/googleCalendar.ts`) —
      conectar, desconectar, y sincronizar manualmente ("Sincronizar
      ahora"), importando eventos a la tabla `events` local con
      `externalSource: "google_calendar"` para que Today/Calendar los
      traten igual que los nativos, nunca "dos calendarios en paralelo".
      Sin `GOOGLE_CLIENT_ID`/`SECRET` configurados, Settings lo explica en
      vez de mostrar un botón roto — mismo patrón que `AI_API_KEY`.
- [x] **Cifrado de tokens OAuth en reposo**: `lib/tokenCrypto.ts`
      (AES-256-GCM, clave derivada de `AUTH_SECRET` — sin pedir otra
      variable de entorno más). Nunca se guarda un token en texto plano.
- [x] Pantalla Settings → Integrations funcional (antes era un stub fijo)
- [ ] Gmail, Google Contacts, Google Drive — mismo patrón que Calendar,
      reusan las mismas credenciales OAuth (solo agregan scopes)
- [ ] Sync automático (hoy es manual, "Sincronizar ahora" — a propósito,
      para que las llamadas a la API de Google sean predecibles)
- [ ] **NEXUS Home**: conector hacia un hub smart-home (Home Assistant)
      para dispositivos Bluetooth/Zigbee/Wi-Fi — no Bluetooth directo
      desde el iPhone, iOS no lo permite en ningún navegador

## ⏳ Fase 5 — Life Modules

- [ ] Finanzas (ingresos/gastos/deudas, dashboard mensual)
- [ ] Entrenamiento (running, gimnasio, peso — cálculo de ritmo automático)
- [ ] Alimentación (registro libre, sin obligar a pesar cada comida)
- [ ] Viajes (itinerario, checklist, presupuesto)
- [ ] Módulos de Trabajo/Hospital y Consultorio (sin historia clínica en el MVP)

## ⏳ Fase 6 — Intelligence

- [x] **Detección proactiva en Today/ATTENTION** (`apps/api/src/lib/proactivity.ts`,
      con 10 tests unitarios propios): conflictos de calendario (dos
      eventos que se superponen, detectados con un sweep sobre el día, no
      solo pares consecutivos), sobrecarga diaria (6+ eventos), y proyecto
      más abandonado (ACTIVE, con más de 14 días de vida y 21+ días sin
      una tarea tocada) — a propósito **como máximo una línea por chequeo**,
      nunca una lista, para no convertirse en spam.
- [x] **Morning Brief / Evening Review**: el mismo Insight de Today ahora
      cambia de enfoque según la hora — de mañana mira hacia adelante (qué
      se viene, qué priorizar), de noche mira hacia atrás (qué quedó
      pendiente, qué se puede soltar por hoy) en vez de listar lo ya
      pasado. Requiere `AI_API_KEY`, igual que el resto del Insight; sin
      key, sigue el mensaje fijo de siempre.
- [ ] Weekly Review generado
- [ ] Notificaciones push reales (con la app cerrada) — necesita un
      service worker + claves VAPID, decisión de infraestructura propia
      que todavía no se tomó; hoy la proactividad es "la próxima vez que
      abrís Today o le hablás a NEXUS", no una notificación que te busca

## ⏳ Fase 7 — Native

- [x] **`apps/mobile` V1**: Expo/React Native, comparte `packages/shared`
      con la PWA (mismos tipos y schemas Zod). Auth completo (Bearer
      tokens en vez de cookies — ver `apps/mobile/README.md` para el
      porqué), y una pantalla Today que NEXUS narra en voz alta apenas
      abre, sin tocar nada — el pedido explícito de que se sienta "como
      un secretario conectado al teléfono", no como una app con botones
      y tarjetas. Probado extremo a extremo (registro → auth → Today con
      datos reales → TTS) vía el target `--web` de Expo + navegador real,
      ya que este entorno no tiene Xcode/simulador.
- [ ] **Speech-to-text real** (el paso que de verdad resuelve voz de
      entrada en iPhone) — necesita un *development build* de Expo
      (`eas build --profile development`, gratis, no requiere cuenta de
      Apple Developer para probar en tu propio teléfono), Expo Go no trae
      un módulo nativo de reconocimiento de voz.
- [ ] Face 3D nativo (hoy es una versión plana simplificada — el shell de
      cristal rotando de la web no tiene equivalente directo sin una
      dependencia 3D/Skia)
- [ ] Wake word en background (dentro de lo que permita iOS, sin hacks)
- [ ] Widgets, Siri Shortcuts / App Intents, Live Activities — también
      necesitan un development build, no Expo Go puro
- [ ] Resto de las pantallas (Inbox, Calendar, Projects, Areas, Memory) —
      hoy `apps/mobile` solo tiene Today
- [ ] Único camino real a Bluetooth *directo* desde el teléfono (si algún
      día hace falta más allá de lo que cubre NEXUS Home vía hub)

## Deuda técnica conocida (no bloqueante, documentada a propósito)

- Command Center (`Ctrl/Cmd+K`) diseñado pero no implementado.
- Vistas de calendario Semana/Mes (hoy solo hay Agenda).
- Resolución de conflictos de sincronización multi-dispositivo más allá
  de "último write gana".
- Generación de íconos PWA en PNG (hoy es un único SVG; suficiente para
  instalar, mejorable para compatibilidad amplia de "maskable icons").
