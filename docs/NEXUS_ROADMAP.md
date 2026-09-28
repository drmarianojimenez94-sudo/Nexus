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
- [x] Inbox + Quick Capture (texto; el botón de voz existe pero está
      deshabilitado hasta Fase 2)
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

## ⏳ Fase 2 — NEXUS Voice (prioridad inmediata)

- [ ] Speech-to-Text (Web Speech API + fallback server-side para Safari/iOS)
- [ ] Text-to-Speech
- [ ] Estados del Face conectados a audio real (`listening`, `thinking`,
      `speaking` ya existen visualmente — la boca ya anima con
      `animationDelay` por barra, falta la fuente de datos: nivel de
      amplitud del audio real vía Web Audio API)
- [ ] Push-to-talk (V1) → conversación continua con la app abierta (V1.5)
      → wake word en foreground (V2)
- [ ] Parser de lenguaje natural (todavía sin IA real — reglas + un
      proveedor de IA simple para el primer intento)

## ⏳ Fase 3 — NEXUS Brain

- [ ] `NexusAIProvider` (interfaz ya documentada en
      [`NEXUS_AI_ARCHITECTURE.md`](NEXUS_AI_ARCHITECTURE.md))
- [ ] Context Engine (resolución de persona/proyecto/área/fecha/confianza)
- [ ] Memory visible/editable/buscable (`/memory`)
- [ ] Tools envolviendo los handlers REST existentes con permisos y
      confirmación
- [ ] Comandos multi-acción con plan explícito y manejo de fallos
- [ ] Deshacer acciones (usa `AiAction`, ya en el schema)

## ⏳ Fase 4 — NEXUS Connect (incluye NEXUS Home)

- [ ] Google Calendar, Gmail, Google Contacts, Google Drive
      (`NexusConnector`, ver [`NEXUS_CONNECTORS.md`](NEXUS_CONNECTORS.md))
- [ ] **NEXUS Home**: conector hacia un hub smart-home (Home Assistant)
      para dispositivos Bluetooth/Zigbee/Wi-Fi — no Bluetooth directo
      desde el iPhone, iOS no lo permite en ningún navegador
- [ ] Pantalla Settings → Integrations funcional (hoy es un stub)
- [ ] Cifrado de tokens OAuth en reposo

## ⏳ Fase 5 — Life Modules

- [ ] Finanzas (ingresos/gastos/deudas, dashboard mensual)
- [ ] Entrenamiento (running, gimnasio, peso — cálculo de ritmo automático)
- [ ] Alimentación (registro libre, sin obligar a pesar cada comida)
- [ ] Viajes (itinerario, checklist, presupuesto)
- [ ] Módulos de Trabajo/Hospital y Consultorio (sin historia clínica en el MVP)

## ⏳ Fase 6 — Intelligence

- [ ] Morning Brief / Evening Review / Weekly Review generados
- [ ] Detección de conflictos de calendario, proyectos abandonados,
      sobrecarga diaria
- [ ] Proactividad calibrada (calidad sobre cantidad — nunca spam)

## ⏳ Fase 7 — Native

- [ ] Evaluación de cliente nativo iPhone (React Native/Expo, comparte
      `packages/shared` con la PWA)
- [ ] Wake word en background (dentro de lo que permita iOS, sin hacks)
- [ ] Widgets, Siri Shortcuts, integraciones más profundas de SO
- [ ] Único camino real a Bluetooth *directo* desde el teléfono (si algún
      día hace falta más allá de lo que cubre NEXUS Home vía hub)

## Deuda técnica conocida (no bloqueante, documentada a propósito)

- Command Center (`Ctrl/Cmd+K`) diseñado pero no implementado.
- Vistas de calendario Semana/Mes (hoy solo hay Agenda).
- Resolución de conflictos de sincronización multi-dispositivo más allá
  de "último write gana".
- Generación de íconos PWA en PNG (hoy es un único SVG; suficiente para
  instalar, mejorable para compatibilidad amplia de "maskable icons").
