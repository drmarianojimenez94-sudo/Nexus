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

## El Nexus Orb

`apps/web/src/components/NexusOrb.tsx`. Un solo componente, seis estados
(`idle`, `listening`, `thinking`, `speaking`, `action-required`,
`offline`), cada uno con su propia animación (`orb-idle`, `orb-listen`,
`orb-think` en `tailwind.config.ts`) y su propio glow. En Fase 1 solo
`idle` está conectado a interacción real (tap → abre Quick Capture); el
resto del sistema de estados ya existe para que Voice (Fase 2) solo tenga
que cambiar la prop `state`, no construir el componente de nuevo.

Aparece en tres lugares con el mismo componente, tamaños distintos:
sidebar de escritorio (40px), bottom nav mobile (56px, destacado sobre el
resto de la barra), pantallas de login/registro (56px, como firma de
marca).

## Regla de movimiento

`prefers-reduced-motion: reduce` desactiva toda animación globalmente
(`globals.css`), no pantalla por pantalla — es una media query a nivel de
`*`, no algo que cada componente tenga que recordar respetar.

Principio aplicado consistentemente: **cinemático en reposo, práctico
trabajando**. El Orb respira en loop suave cuando no hay nada pasando;
las listas de tareas, proyectos e inbox son paneles planos sin animación
de entrada más allá de un fade sutil (`animate-fade-in`, 200ms) — no
hay ningún elemento decorativo que compita con la lectura de una lista de
tareas atrasadas.

## Layout responsive

No es un mismo layout escalado. Tres breakpoints con propósito distinto:

- **Mobile** (`< 640px`, breakpoint `sm` de Tailwind): `BottomNav.tsx`
  fija abajo, Sidebar oculto (`hidden`). Navegación de una mano: Today,
  Calendar, Orb central, Projects, More.
- **Desktop** (`≥ 640px`): `Sidebar.tsx` fijo a la izquierda (Today,
  Inbox, Calendar, Projects, Areas, Settings), `BottomNav` oculto. El
  Orb vive arriba del sidebar, siempre visible.
- **Command Center global** (`Ctrl/Cmd+K`, brief §33/§31): diseñado, no
  implementado en Fase 1 — no bloqueaba el milestone funcional y merece
  su propio pase de UI (búsqueda universal con resultados agrupados por
  tipo: contacto, proyecto, evento, nota).

## Por qué esto migra bien a nativo

Todos los componentes de pantalla (`NexusOrb`, `BottomNav`, `Sidebar`,
`QuickCaptureModal`) son componentes React funcionales sin dependencias de
DOM específicas más allá de clases Tailwind — el modelo mental (props,
estado local, composición) es el mismo que usaría React Native. La capa
que sí es específica de web (`fetch` con cookies, `next/navigation`) está
aislada en `src/lib/api.ts` y `src/lib/auth-context.tsx`; migrar a Expo
implica reemplazar esa capa de transporte/routing, no repensar los
componentes visuales.
