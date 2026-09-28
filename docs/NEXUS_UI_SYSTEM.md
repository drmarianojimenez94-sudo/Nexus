# NEXUS — UI System

## Tokens

Definidos en `apps/web/tailwind.config.ts` bajo `theme.extend.colors.nexus`:

| Token | Valor | Uso |
|---|---|---|
| `nexus-bg` | `#05070c` | Fondo base, casi negro |
| `nexus-panel` | `#0d121f` | Base de los paneles translúcidos |
| `nexus-border` | `rgba(148,197,255,0.12)` | Bordes finos de HUD |
| `nexus-cyan` | `#4fd8ff` | Acento primario — acciones, estado activo |
| `nexus-violet` | `#8b7bff` | Acento secundario — IA/insight, "thinking" |
| `nexus-amber` | `#f5b95c` | Atención (deadlines, alertas no críticas) |
| `nexus-danger` | `#ff6b6b` | Errores, acciones destructivas |
| `nexus-text` / `nexus-muted` | `#e7ecf7` / `#8791a8` | Texto primario / secundario |

`.glass-panel` (en `globals.css`) es el patrón visual repetido en todo el
producto: `rounded-2xl border border-nexus-border bg-nexus-panel/70
backdrop-blur-xl`. Todas las superficies (Today, Inbox, Calendar,
Projects, modales) lo usan — es lo que da la sensación de profundidad por
capas pedida en el brief sin recurrir a sombras pesadas.

## El Nexus Face

`apps/web/src/components/NexusFace.tsx`. Reemplaza al concepto original
de "Orb" por decisión de producto: en vez de una esfera abstracta, un
rostro mínimo — dos ojos, una boca hecha de barras tipo ecualizador —
sobre el mismo panel de vidrio oscuro que el resto de la UI. La intención
es la sensación de "algo te mira y te escucha" sin caer en un rostro
fotorrealista, que sería costoso de animar con fluidez en un teléfono y
más difícil de acertar visualmente (efecto "valle inquietante").

Seis estados (`idle`, `listening`, `thinking`, `speaking`,
`action-required`, `offline`), cada uno cambia el color de ojos/boca y su
animación:

- `idle`: parpadeo infrecuente (`eye-blink`, cada ~6s, no cada loop corto
  — un parpadeo constante se lee como robótico) + boca en shimmer suave.
- `listening`: ojos alertas (`eye-alert`), boca reacciona rápido —
  pensado para cuando haya audio de entrada real (Fase 2).
- `thinking`: anillo violeta rotando alrededor del panel (`face-scan`,
  `conic-gradient`), ojos y boca quietos.
- `speaking`: boca anima en ritmo de habla (`mouth-speak`), cada barra
  con su propio `animationDelay`/duración para que el conjunto lea como
  una forma de onda, no un solo elemento en loop.
- `action-required`: todo en ámbar, pulso más marcado.
- `offline`: apagado, sin animación, opacidad reducida.

Solo `idle` (y `thinking` en el loader de `AppShell`) están conectados a
interacción real en Fase 1 — tocar el Face abre Quick Capture. El resto
del sistema de estados ya existe para que Voice (Fase 2) solo tenga que
alimentar la prop `state` desde el nivel de audio real, no construir el
componente de nuevo.

Aparece en cuatro lugares con el mismo componente, tamaños distintos:
sidebar de escritorio (40px), bottom nav mobile (56px, destacado sobre el
resto de la barra), pantallas de login/registro (56px, firma de marca), y
como cabecera de Today (72px) — ahí es donde más se nota el cambio de
identidad: Today ya no es una lista, es una consola que "despliega"
paneles alrededor del Face (ver más abajo).

## Regla de movimiento

`prefers-reduced-motion: reduce` desactiva toda animación globalmente
(`globals.css`), no pantalla por pantalla — es una media query a nivel de
`*`, no algo que cada componente tenga que recordar respetar.

Principio aplicado consistentemente: **cinemático en reposo, práctico
trabajando**. El Face respira en loop suave cuando no hay nada pasando;
las listas de tareas, proyectos e inbox son paneles planos sin animación
de entrada más allá de un fade sutil (`animate-fade-in`, 200ms) — no
hay ningún elemento decorativo que compita con la lectura de una lista de
tareas atrasadas.

## Today como consola JARVIS

Today es la única pantalla que rompe el patrón "lista plana": el Face
(72px) encabeza la vista, y las secciones (NOW, PRIORIDADES, TIMELINE,
ATTENTION, INSIGHT) se acomodan en una grilla de 2 columnas que "despliega"
al cargar — cada panel entra con `animate-panel-deploy` (fade + slight
translate) con un `animationDelay` incremental por panel (60ms entre uno y
el siguiente), así se leen como si el sistema los fuera activando en
secuencia alrededor del Face, no como una lista que apareció de golpe. El
color del Face también reacciona: pasa a ámbar (`action-required`) si hay
algo en ATTENTION. El resto de las pantallas (Inbox, Calendar, Projects)
se mantienen como paneles planos a propósito — el efecto HUD es para el
punto de entrada del día, no para cada lista que el usuario tiene que leer
con calma.

## Onboarding

Primer login: un tour de pantalla completa (`OnboardingTour.tsx`) recorre
las funciones principales (Face/Quick Capture, Today, Inbox, Calendar,
Projects, Areas) en pasos con "Siguiente"/"Omitir". El estado
"ya lo vio" se guarda server-side (`preferences` con key
`onboarding_completed`, no en `localStorage`) para que sea consistente
entre iPhone y Windows — si ya completaste el tour en el celular, no
vuelve a aparecer al entrar desde la PC.

## Layout responsive

No es un mismo layout escalado. Tres breakpoints con propósito distinto:

- **Mobile** (`< 640px`, breakpoint `sm` de Tailwind): `BottomNav.tsx`
  fija abajo, Sidebar oculto (`hidden`). Navegación de una mano: Today,
  Calendar, Face central, Projects, More.
- **Desktop** (`≥ 640px`): `Sidebar.tsx` fijo a la izquierda (Today,
  Inbox, Calendar, Projects, Areas, Settings), `BottomNav` oculto. El
  Face vive arriba del sidebar, siempre visible.
- **Command Center global** (`Ctrl/Cmd+K`, brief §33/§31): diseñado, no
  implementado en Fase 1 — no bloqueaba el milestone funcional y merece
  su propio pase de UI (búsqueda universal con resultados agrupados por
  tipo: contacto, proyecto, evento, nota).

## Por qué esto migra bien a nativo

Todos los componentes de pantalla (`NexusFace`, `BottomNav`, `Sidebar`,
`QuickCaptureModal`) son componentes React funcionales sin dependencias de
DOM específicas más allá de clases Tailwind — el modelo mental (props,
estado local, composición) es el mismo que usaría React Native. La capa
que sí es específica de web (`fetch` con cookies, `next/navigation`) está
aislada en `src/lib/api.ts` y `src/lib/auth-context.tsx`; migrar a Expo
implica reemplazar esa capa de transporte/routing, no repensar los
componentes visuales.
