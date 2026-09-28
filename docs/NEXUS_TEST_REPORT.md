# NEXUS — Test Report (Fase 1 + Voice V1)

Última corrida: ver commits de este repositorio. Ejecutado contra Postgres
16 local (`nexus_test` para tests, `nexus_dev` para build/smoke), Node 22.

## Suite automatizada (`apps/api`, Vitest + Supertest)

```
✓ src/tests/tasks.test.ts (5 tests)
  ✓ tasks > creates a task with just a title
  ✓ tasks > rejects an empty title
  ✓ tasks > marks a task done and stamps completedAt
  ✓ tasks > blocks access to another user's task
  ✓ first functional milestone (spec §55) > persists a project task and a reminder created in the same session
✓ src/tests/auth.test.ts (5 tests)
  ✓ auth > registers a new user and sets session cookies
  ✓ auth > rejects duplicate registration
  ✓ auth > logs in with correct credentials and rejects wrong password
  ✓ auth > returns the current user for an authenticated session
✓ src/tests/inbox.test.ts (2 tests)
  ✓ quick capture / inbox > captures an unclassified thought
  ✓ quick capture / inbox > lists only pending items and dismiss removes them
✓ src/tests/today.test.ts (2 tests)
  ✓ today > returns an empty-but-valid shape with no data
  ✓ today > surfaces overdue tasks under attention
✓ src/tests/preferences.test.ts (2 tests)
  ✓ preferences > starts empty and round-trips a value
  ✓ preferences > upserts on repeated writes instead of erroring

Test Files  5 passed (5)
     Tests  16 passed (16)
```

Cobertura deliberada: autenticación completa (registro, duplicados, login
correcto/incorrecto, sesión), aislamiento entre usuarios (un usuario no
puede tocar las tareas de otro — `404`, no `403`, para no filtrar
existencia), validación de entrada (título vacío rechazado con `400`), y
el milestone funcional exacto del brief (§55): crear un proyecto, una
tarea con deadline vinculada a ese proyecto, y un recordatorio, y
confirmar que las tres cosas persisten al volver a leerlas — la prueba
más directa de que "cerrar y volver a abrir no pierde datos".

Nota de infraestructura de tests: los archivos de test comparten una sola
base Postgres física con emails de fixture fijos, así que corren
secuencialmente (`fileParallelism: false` en `vitest.config.ts`) — se
detectó como bug real durante el desarrollo (colisiones de `UNIQUE
constraint` al correr en paralelo) y se corrigió antes de dar la Fase 1
por terminada, no se dejó como flaky conocido.

## Chequeos de calidad (todo el monorepo)

```
pnpm lint       → 0 errores, 0 warnings (api, web, shared)
pnpm typecheck  → 0 errores (api, web, shared)
pnpm build      → api: esbuild bundle ~30kb; web: 13 rutas, build de producción OK
```

## Verificación manual en navegador real (Playwright, Chromium)

Dos corridas contra `apps/api` + `apps/web` en local (viewport 390×844,
tamaño de iPhone):

**Camino dorado original:**
1. `POST /register` vía formulario → redirige a `/today`, saluda por
   nombre ("Buenas tardes, Mariano.") ✅
2. Tap en el Face → modal de Quick Capture → guardar texto libre → el
   texto aparece en `/inbox` ✅
3. Crear un proyecto ("La Horda") desde `/projects` → aparece en la
   grilla sin recargar manualmente ✅

**Face + onboarding (verificación del rediseño):**
1. Registro nuevo → el tour de onboarding aparece automáticamente ✅
2. Recorrido completo de los 6 pasos, Face cambiando de estado en cada
   uno (capturado en screenshots) ✅
3. Today renderiza como grilla HUD con el Face arriba, paneles con
   entrada escalonada (`animate-panel-deploy`) ✅
4. Recarga de página: el onboarding **no** vuelve a aparecer — el flag
   quedó en `preferences` server-side, no en `localStorage` ✅

Sin errores de JavaScript no manejados (`pageerror`) durante ninguno de
los dos flujos.

## Verificación manual de Voice V1 (Playwright, Chromium headless)

Registro nuevo → onboarding narrado por voz omitido → `/today`:

1. Botón "🔊 Escuchar resumen" visible y clickeable, sin errores ✅
2. Tap en el Face abre `VoiceSession` en modo voz (Chromium headless
   expone `SpeechRecognition`/`webkitSpeechRecognition`, a diferencia de
   Safari/iOS real) — el Face 3D y el texto "Te escucho." renderizan sin
   `pageerror` ✅
3. Botón "Cerrar" presente y funcional ✅
4. Deep link `/today?listen=1` abre directo en modo voz sin pasar por el
   botón, confirmando el camino que usaría un Siri Shortcut ✅

No se pudo verificar en este entorno el caso real de iPhone (Safari sin
`SpeechRecognition`, cayendo a `QuickCaptureModal`) porque el sandbox no
tiene WebKit — la caída a texto está cubierta por el código
(`sttSupported` en `useSpeech.ts`) y por el mismo `QuickCaptureModal` ya
verificado en Fase 1, pero no por un navegador WebKit real.

## Qué NO está cubierto todavía (a propósito, no por descuido)

- Tests de componentes/UI de `apps/web` (se prioriza backend + smoke
  manual; se agregan cuando haya lógica de cliente no trivial que
  justifique el costo).
- Tests de carga/concurrencia.
- Verificación en un navegador WebKit/iOS real (el sandbox de desarrollo
  no lo tiene) — pendiente de probar en el iPhone del usuario.
- Tests de los módulos de Fase 3+ (Brain, Connectors, Life Modules) — no
  existen todavía, no hay nada que testear.
