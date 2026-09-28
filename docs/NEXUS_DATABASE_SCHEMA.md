# NEXUS — Database Schema

Fuente de verdad: [`database/schema.prisma`](../database/schema.prisma).
Este documento explica el *porqué*, no repite el schema campo por campo.

## Principios

- **Todo cuelga de `userId`.** Multiusuario desde el día uno, aunque hoy
  exista un solo usuario. Cada tabla de dominio tiene `userId` con
  `onDelete: Cascade` hacia `users`.
- **UUID como PK en todo.** Evita filtrar volumen de datos por IDs
  secuenciales y simplifica generar IDs en el cliente si hace falta
  (offline-first, Fase 6+).
- **Diseñado completo, implementado por fases.** Las 28 tablas del brief
  original están en el schema desde la Fase 1 (evita migraciones
  destructivas más adelante), pero solo las que Fase 1 necesita tienen
  endpoints reales hoy.

## Grupos de tablas

| Grupo | Tablas | Estado API |
|---|---|---|
| Identidad | `users`, `devices`, `refresh_tokens` | ✅ auth completo |
| Áreas / Proyectos | `areas`, `projects`, `project_milestones` | ✅ CRUD completo |
| Tareas | `tasks`, `subtasks` | ✅ CRUD completo |
| Calendario | `events`, `reminders` | ✅ CRUD completo |
| Notas / Inbox | `notes`, `inbox_items` | ✅ inbox + quick capture; `notes` sin endpoint propio aún |
| Personas / Memoria | `contacts`, `entities`, `relationships`, `memories`, `preferences` | ⏳ schema listo, endpoints en Fase 3 |
| Finanzas | `financial_transactions`, `debts` | ⏳ Fase 5 |
| Salud | `workouts`, `food_logs`, `health_logs` | ⏳ Fase 5 |
| Viajes | `trips` | ⏳ Fase 5 |
| Soporte | `attachments`, `notifications`, `integrations` | ⏳ Fase 4/6 |
| IA | `ai_conversations`, `ai_actions` | ⏳ Fase 3 (NexusBrain) |
| Auditoría | `audit_log` | ✅ ya registra toda escritura de la API |

## Decisiones de modelado que vale la pena explicar

- **`Task.status` vs. `CalendarItemType`**: una tarea con `deadline` no se
  duplica como evento de calendario. El endpoint `/today` y (a futuro)
  `/calendar` combinan tareas con deadline + eventos + recordatorios en
  una sola vista, sin que la tarea "viva" en dos tablas.
- **`Entity` + `Relationship` en vez de solo `Contact`**: un `Contact` es
  una tarjeta con datos de contacto; una `Entity` es cualquier cosa que
  NexusBrain necesite razonar (`person`, `place`, `organization`,
  `thing`), y `Relationship` conecta dos entidades con una etiqueta libre
  ("jefe en", "vive en"). Esto es lo que permite resolver "Pedro es mi
  jefe en el hospital" → "mandale a Pedro el documento" sin tener que
  meter ese razonamiento adentro de la tabla de contactos.
- **`AiAction` separado de `AuditLog`**: `AuditLog` es el registro
  genérico de "qué pasó" para cualquier escritura (lo usa hoy toda la
  API). `AiAction` es específico de NexusBrain: guarda la tool invocada,
  el input, el nivel de permiso evaluado y si quedó `planned` / `executed`
  / `undone` — necesario para poder mostrarle al usuario "esto lo hizo
  NEXUS" y ofrecer deshacer.
- **`Integration.status`** usa el enum `NOT_CONNECTED / CONNECTED / ERROR`
  pedido explícitamente en el brief para la pantalla de Settings →
  Integrations.

## Migraciones

Prisma Migrate, migraciones versionadas en `database/migrations/`. La
migración inicial (`_init`) crea las 28 tablas de una vez — no hay
migraciones incrementales todavía porque el proyecto recién arranca.

```bash
pnpm db:migrate   # dev: crea + aplica una nueva migración
pnpm db:deploy    # CI/prod: aplica migraciones pendientes sin generar nuevas
```

## Nota técnica: por qué `database/` es su propio paquete pnpm

`database/package.json` existe (con `prisma` y `@prisma/client` como
dependencias) porque Prisma 6.19+ necesita que el paquete más cercano al
`schema.prisma` tenga esas dependencias declaradas cuando el schema vive
fuera del directorio del paquete que lo consume (`apps/api`). Sin esto,
`prisma generate`/`migrate` intentan auto-instalarse y esa operación
anidada falla en entornos sandboxeados. `apps/api/prisma.config.ts` apunta
al schema real (`../../database/schema.prisma`); el cliente generado se
resuelve automáticamente vía `@prisma/client` en `apps/api`.
