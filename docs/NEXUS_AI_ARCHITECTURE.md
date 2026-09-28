# NEXUS — AI Architecture (Fase 3+)

No implementado todavía (Fase 1 es NEXUS Core, sin IA). Este documento fija
el diseño para que Fase 2/3 se construyan sobre un contrato estable, no
sobre lo que sea más fácil en el momento.

## `NexusAIProvider` — abstracción de proveedor

```ts
interface NexusAIProvider {
  parseNaturalLanguage(input: string, context: NexusContext): Promise<ParsedIntent>;
  detectIntent(input: string): Promise<Intent>;
  extractEntities(input: string): Promise<ExtractedEntity[]>;
  planActions(intent: Intent, context: NexusContext): Promise<PlannedAction[]>;
  generateResponse(result: ActionResult[]): Promise<string>;
  generateDailyBrief(context: NexusContext): Promise<string>;
  generateWeeklyReview(context: NexusContext): Promise<string>;
  summarizeProject(project: Project): Promise<string>;
}
```

Ningún componente del producto llama directamente a un SDK de un
proveedor de IA — todo pasa por esta interfaz. Cambiar de proveedor (o
usar uno distinto para voz vs. para planificación) es una implementación
nueva de `NexusAIProvider`, no una reescritura del producto.

## Salida estructurada obligatoria

Toda respuesta del modelo que vaya a disparar una acción se valida contra
un schema Zod **antes** de tocar una tool — los mismos schemas que ya
existen en `packages/shared` (`createTaskSchema`, `createEventSchema`,
etc.) son los que el LLM debe producir. Si la salida no valida, NexusBrain
no ejecuta nada y le pide una aclaración al usuario; nunca "adivina" un
campo crítico (brief §43: *nunca inventar información crítica*).

## Context Engine

Antes de ejecutar cualquier instrucción, NexusBrain arma un objeto de
contexto:

```ts
interface NexusContext {
  userId: string;
  intent: Intent;
  entities: ExtractedEntity[];     // personas, proyectos, áreas, fechas mencionadas
  resolvedPerson?: Contact | Entity;
  resolvedProject?: Project;
  resolvedArea?: Area;
  dateTime?: { date?: string; time?: string };
  location?: string;
  service?: "calendar" | "gmail" | "drive" | "contacts";
  action: string;
  permissionLevel: PermissionLevel;  // packages/shared/permissions.ts
  confidence: number;                 // 0–1
}
```

Si `confidence` es baja para un campo crítico (a quién se le manda un
mail, qué tarea se está completando), NexusBrain pregunta en vez de
actuar. Esto es una decisión de producto, no un detalle de
implementación: el costo de una acción incorrecta (Nivel 3/4) es mayor
que el costo de una pregunta de más.

## Resolución de contactos

"Mandale un mail al doctor García" busca en `contacts` (y, más adelante,
en Google Contacts vía el conector). Si hay una coincidencia exacta, se
usa. Si hay varias, NexusBrain pregunta cuál y — si el usuario lo
autoriza — guarda esa elección como una `Relationship`/`Memory` para no
volver a preguntar.

## Multi-acción

Una instrucción compuesta se descompone en un plan de acciones con
dependencias explícitas antes de ejecutar nada:

```
"Mandale un correo a Pedro con el informe y recordame mañana preguntarle si lo recibió"
  → resolvePerson("Pedro")
  → resolveDocument("informe")
  → draftEmail(person, document)
  → confirm()              // Nivel 3: requiere confirmación explícita
  → sendEmail()
  → createReminder(tomorrow, "Preguntarle a Pedro si recibió el informe")
```

Si un paso falla, el plan se detiene ahí y NexusBrain informa exactamente
qué paso falló y por qué — nunca sigue ejecutando pasos posteriores sobre
una base rota, y nunca revierte pasos ya confirmados sin que el usuario lo
pida.

## Por qué esto es fácil de conectar sobre lo que ya existe

Los "tools" que NexusBrain va a llamar en la Fase 3 son, literalmente, los
handlers que ya implementan los endpoints REST de Fase 1
(`apps/api/src/routes/*.ts`). Cada uno ya tiene: schema Zod de entrada,
registro en `audit_log`, y un modelo de permisos definido (aunque hoy solo
se aplica "requiere sesión"). Envolver un handler existente como tool de
NexusBrain es agregar metadata (`permissionLevel`, nombre de tool), no
reescribir lógica de negocio.
