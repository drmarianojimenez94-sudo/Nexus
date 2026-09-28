# NEXUS — Arquitectura Maestra

Este documento es la respuesta a los 15 puntos pedidos antes de empezar a
construir. Refleja lo que efectivamente se implementó en la Fase 1 (Nexus
Core) y el diseño sobre el que se construyen las fases siguientes — no es
una descripción aspiracional desconectada del código.

## 1. Arquitectura técnica propuesta

Monorepo con **frontend y backend completamente independientes**,
comunicados por una API JSON sobre HTTP. El backend no sabe si quien lo
llama es la PWA, una futura app nativa de iPhone, o un cliente de Windows —
eso permite reemplazar o sumar clientes sin tocar la lógica de negocio.

```
Cliente (PWA hoy, nativo mañana)  →  API (Express + Prisma)  →  Postgres
                                        ↑
                                   NexusBrain (Fase 3, se monta
                                   delante de las mismas tools/endpoints)
```

`NexusBrain` no es un servicio aparte: es una capa que, cuando exista,
llamará a las mismas funciones de negocio que hoy exponen los endpoints
REST (`createTask`, `createEvent`, etc.), evaluando permisos y registrando
auditoría antes de ejecutar. Así la voz y el texto llegan al mismo lugar.

## 2. Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind | PWA instalable hoy, SSR cuando haga falta, migración a React Native es directa (mismo modelo mental de componentes) |
| Backend | Express + TypeScript (ESM) | Explícito, sin magia de framework; fácil de poner NexusBrain adelante |
| Base de datos | PostgreSQL vía Prisma | Integridad relacional para un grafo de tareas/proyectos/personas; Neon como proveedor gestionado preferido |
| Auth | JWT propio (access + refresh) en cookies httpOnly, bcrypt | Sin dependencia de terceros; control total sobre sesiones y dispositivos |
| Validación | Zod, compartido entre cliente y servidor (`packages/shared`) | Un solo schema define el contrato de red y la validación de formularios |
| IA | Interfaz `NexusAIProvider` (Fase 3) | El producto nunca queda atado a un proveedor de LLM específico |
| Build backend | esbuild (bundle) + tsc (chequeo de tipos) | Evita depender de `tsc` para emitir JS con resolución de módulos estricta, que rompe con la forma en que Prisma publica sus tipos |

## 3. Modelo de base de datos

`database/schema.prisma` es la fuente única de verdad. Contiene las 28
tablas listadas en el brief original, todas con `userId` (multiusuario
desde el día uno aunque hoy exista un solo usuario). Detalle completo en
[`NEXUS_DATABASE_SCHEMA.md`](NEXUS_DATABASE_SCHEMA.md).

Diseño completo desde ahora, pero **implementado con API real solo donde
la Fase 1 lo necesita** (usuarios, áreas, proyectos, tareas, subtareas,
eventos, recordatorios, inbox, audit log). El resto de las tablas
(finanzas, salud, viajes, memoria, contactos, integraciones, IA) ya tienen
su lugar en el schema para no tener que migrar datos más adelante, pero
sus endpoints se construyen en la fase que les corresponde (§15).

## 4. Arquitectura NexusBrain (Fase 3)

`NexusBrain` es un orquestador, no un microservicio nuevo. Su forma:

```
transcribeOrParse(input) → detectIntent() → resolveContext()
  → planActions()  // una instrucción puede producir N acciones
  → for each action: checkPermission() → (confirm si Nivel 3/4) → executeTool()
  → recordAudit() → generateResponse()
```

Cada `tool` que NexusBrain puede invocar **es la misma función que ya usa
la API REST** (por ejemplo, el handler de `POST /tasks`), envuelta con:
schema de entrada (Zod, ya existe en `packages/shared`), nivel de permiso
(§9 del brief), y registro en `audit_log` (ya implementado, `recordAudit()`
en `apps/api/src/lib/audit.ts`). Esto significa que darle tools a
NexusBrain en la Fase 3 es mayormente conectar, no reescribir.

Instrucciones múltiples ("mandale un correo a Pedro y recordame mañana
preguntarle") se resuelven como una lista de acciones con dependencias
simples (resolver persona → preparar mensaje → confirmar → enviar → crear
seguimiento), cada una con su propio nivel de permiso.

## 5. Arquitectura Voice (Fase 2)

```
Micrófono → Web Speech API / motor STT → NexusBrain.parse() → NexusAIProvider
  → acciones → NexusBrain.generateResponse() → TTS → NEXUS Face (estado "speaking")
```

Por etapas, tal como pide el brief:
- **V1**: push-to-talk (un tap sostiene, se suelta y se envía).
- **V1.5**: conversación continua mientras la app está abierta.
- **V2**: wake word ("Nexus…") solo mientras la app está activa/foreground.
- No se implementa nada que mantenga el micrófono escuchando en segundo
  plano sin que el usuario lo haya abierto explícitamente — ni en PWA (no
  es técnicamente posible) ni se plantea como hack en la futura app nativa.

## 6. Arquitectura Memory (Fase 3)

Tablas `memories`, `entities`, `relationships`, `preferences` ya están en
el schema. El principio de diseño (brief §6) es que la memoria **nunca es
una caja negra**: cada fila es visible, editable y buscable desde una
pantalla `Memory` (Fase 3), no solo un vector embebido en un prompt.
`entities` + `relationships` modelan explícitamente afirmaciones como
"Pedro es mi jefe en el hospital" para que NexusBrain pueda resolver
"mandale a Pedro el documento" sin ambigüedad.

## 7. Arquitectura Tools

Cada tool sigue el mismo contrato, ya establecido por los endpoints
actuales:

```ts
{
  name: "createTask",
  schema: CreateTaskInput,      // Zod, packages/shared
  permissionLevel: PermissionLevel.ACTION, // packages/shared/permissions.ts
  handler: (input, ctx) => Promise<Task>,
  audit: true,                  // recordAudit() ya integrado en cada ruta
}
```

Los niveles de permiso (0 Conversación, 1 Lectura, 2 Acción reversible, 3
Comunicación externa, 4 Crítico) están definidos en
`packages/shared/src/permissions.ts` desde la Fase 1, aunque hoy solo la
autenticación los usa implícitamente (todo lo que requiere sesión es al
menos Nivel 1). NexusBrain, en la Fase 3, es quien empieza a leerlos para
decidir si ejecuta directo o pide confirmación.

## 8. Estrategia de integraciones (Fase 4)

`NexusConnector` como interfaz común: `connect()`, `disconnect()`,
`getStatus()`, y un set de métodos específicos por proveedor (`listEvents`,
`searchEmail`, `resolveContact`, `searchDrive`). La tabla `integrations`
(ya en el schema) guarda `status` (`NOT_CONNECTED` / `CONNECTED` / `ERROR`)
y tokens OAuth — nunca contraseñas de Google. Cada conector es un módulo
independiente en `packages/nexus-connectors/` (Fase 4); agregar uno nuevo
no debería requerir tocar `NexusBrain`, solo registrar sus tools.

Se suma **NEXUS Home** a esta fase (no estaba en el brief original,
agregado por dirección de producto): dispositivos smart-home/Bluetooth se
controlan vía un hub (Home Assistant) usando el mismo patrón de
conector, no vía Bluetooth directo desde el teléfono — ver el porqué en
la sección 13 y el detalle en
[`NEXUS_CONNECTORS.md`](NEXUS_CONNECTORS.md).

## 9. Estrategia específica para iPhone

- **PWA instalable** (`display: standalone`, iconos, manifest) — ya
  funciona: `apps/web/public/manifest.webmanifest`.
- Layout mobile-first real (no desktop encogido): bottom nav con el Face
  destacado en el centro (`BottomNav.tsx`), `safe-area-inset` respetado en
  el nav y en modales (`env(safe-area-inset-bottom)`).
- Un solo pulgar: navegación inferior, Quick Capture accesible desde
  cualquier pantalla vía el Face.
- Reconocimiento de voz vía Web Speech API en Fase 2 (limitaciones de iOS
  Safari se documentan en la sección 13).
- App nativa (Fase 7) queda como camino de escape para lo que iOS no
  permite a una PWA (wake word en background, Siri Shortcuts, widgets).

## 10. Estrategia Windows

Mismo cliente Next.js, breakpoint de escritorio con layout de tres
columnas: sidebar fija (`Sidebar.tsx`, ya implementado) + contenido +
panel contextual de NEXUS (pendiente de Fase 3, hoy el Face en el sidebar
abre Quick Capture). `Ctrl/Cmd+K` para un Command Center global queda
como tarea de pulido post-Fase 1 (no bloqueante para el milestone
funcional). No se duplica código de UI entre iPhone y Windows: son los
mismos componentes React con clases responsive de Tailwind
(`sm:hidden`, `sm:flex`, etc.), no dos apps separadas.

## 11. Sistema visual NEXUS

Identidad propia (no una copia de ninguna franquicia): fondo casi negro
con gradiente radial sutil, paneles translúcidos con blur
(`.glass-panel`), acentos cian/violeta, el **Nexus Face** como elemento
central animado (`NexusOrb.tsx`). Reglas aplicadas:
- Cinemático en reposo (el Face "respira"), práctico mientras se trabaja
  (paneles planos y legibles en Today/Projects/Inbox).
- `prefers-reduced-motion` respetado globalmente en `globals.css`.
- Estados del Face ya modelados (`idle`, `listening`, `thinking`,
  `speaking`, `action-required`, `offline`) aunque solo `idle` está
  conectado a datos reales hasta que exista Voice (Fase 2).

Detalle completo en [`NEXUS_UI_SYSTEM.md`](NEXUS_UI_SYSTEM.md).

## 12. Mapa de pantallas (implementadas en Fase 1)

```
/login, /register        — auth
/today                    — NOW, PRIORIDADES, TIMELINE, ATTENTION, INSIGHT
/inbox                    — captura sin clasificar, "→ Tarea" / "Descartar"
/calendar                 — agenda agrupada por día + alta rápida de evento
/projects                 — grilla de proyectos + alta rápida
/projects/[id]            — detalle: tareas, hitos
/areas                    — áreas del usuario (no hardcodeadas)
/more (mobile) / sidebar  — navegación secundaria + logout
/settings                 — stub, ahí viven las integraciones desde Fase 4
```

Pendientes de fases posteriores: `/memory` (Fase 3), Command Center
completo (Ctrl+K, Fase 3), vistas de Semana/Mes en calendario (pulido),
módulos de vida (Finanzas/Salud/Viajes, Fase 5).

## 13. Riesgos y limitaciones técnicas

- **Web Bluetooth no existe en iOS** (ningún navegador — todos usan
  WebKit por mandato de Apple). Ninguna PWA puede hablarle a un
  dispositivo Bluetooth directamente desde un iPhone, sin excepción y sin
  workaround. Por eso NEXUS Home (§8) se diseña contra un hub smart-home
  en vez de contra Bluetooth directo — es la arquitectura correcta de
  todas formas, no un parche por la limitación.
- **Safari/iOS y Web Speech API**: el soporte de reconocimiento de voz en
  Safari es más limitado que en Chrome; Voice (Fase 2) probablemente
  necesite un fallback a un proveedor STT en el servidor (subir audio,
  transcribir server-side) para tener paridad real en iPhone.
- **Wake word en background**: técnicamente no disponible para una PWA en
  iOS bajo ninguna circunstancia razonable — requiere la app nativa
  (Fase 7) y, aun ahí, respetando los límites que dé la plataforma (nunca
  micrófono oculto).
- **Prisma + resolución estricta de módulos Node (`NodeNext`)**: el
  paquete generado de Prisma no publica un mapa de `exports` con
  condición `types`, lo que rompe bajo `moduleResolution: NodeNext`. Se
  resolvió usando `moduleResolution: Bundler` + esbuild para el build de
  producción del API en vez de `tsc` puro — documentado para que no se
  reintroduzca el problema sin querer.
- **Sincronización multi-dispositivo**: hoy es "último write gana" a
  nivel de fila (Postgres como fuente única). Para edición concurrente
  real (dos dispositivos editando el mismo proyecto a la vez) va a hacer
  falta un mecanismo explícito de resolución de conflictos — no
  implementado todavía, no es necesario para el milestone de Fase 1.

## 14. Qué puede hacerse en PWA vs. qué requiere app nativa

| Funcionalidad | PWA | Nativa |
|---|---|---|
| Instalación en Home Screen, uso offline básico | ✅ | ✅ |
| Push-to-talk, conversación continua con la app abierta | ✅ | ✅ |
| Wake word con la app abierta (foreground) | ✅ (Fase 2) | ✅ |
| Wake word en background | ❌ | ✅ (Fase 7) |
| Notificaciones push | ⚠️ limitado en iOS Safari, mejora con la app instalada | ✅ |
| Widgets de pantalla de inicio, Siri Shortcuts | ❌ | ✅ |
| Haptics | ⚠️ limitado | ✅ |

## 15. Roadmap de implementación

Ver [`NEXUS_ROADMAP.md`](NEXUS_ROADMAP.md) para el detalle fase por fase,
con lo ya construido marcado explícitamente.
