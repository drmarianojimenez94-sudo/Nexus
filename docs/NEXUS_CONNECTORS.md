# NEXUS — Connectors (Fase 4)

No implementado todavía. La tabla `integrations` y el enum
`IntegrationStatus` (`NOT_CONNECTED` / `CONNECTED` / `ERROR`) ya existen en
el schema para que la pantalla Settings → Integrations tenga dónde leer
estado desde el día en que se construya.

## `NexusConnector` — interfaz común

```ts
interface NexusConnector {
  readonly provider: "google_calendar" | "gmail" | "google_contacts" | "google_drive";
  connect(userId: string): Promise<{ authUrl: string }>;   // inicia OAuth
  handleCallback(userId: string, code: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  getStatus(userId: string): Promise<IntegrationStatus>;
}
```

Cada conector vive en su propio módulo bajo `packages/nexus-connectors/` y
se registra ante NexusBrain con sus propias tools (`searchEmail`,
`draftEmail`, `sendEmail` para Gmail; `getAgenda`, `createEvent` para
Calendar; etc. — nombres ya usados en el brief §7). Agregar un conector
nuevo no debería requerir tocar `NexusBrain` ni los conectores existentes.

## Google Calendar

- Leer calendario, crear eventos, modificar eventos, consultar agenda.
- Los eventos importados se guardan en la tabla `events` local
  (`externalSource: "google_calendar"`, `externalId`) para que Today y
  Calendar los traten igual que los eventos nativos de NEXUS — sin esto,
  el usuario tendría dos calendarios en paralelo.

## Gmail

- Buscar, leer, crear borradores, responder, enviar.
- `sendEmail` es Nivel 3 (Comunicación externa, brief §9): siempre pasa
  por la pantalla de confirmación ("Preparé: Para / Asunto / … ¿Envío?")
  salvo que el usuario haya configurado lo contrario explícitamente.

## Google Contacts

- Resolución de nombres naturales ("el doctor García") a contactos reales.
  Alimenta la resolución de contactos de NexusBrain (ver doc de IA) además
  de la tabla local `contacts`.

## Google Drive

- Buscar documentos, relacionarlos con proyectos (vía `attachments`),
  abrir documentos. `readDocument` es Nivel 1 (lectura); adjuntar un
  documento a un proyecto es Nivel 2 (reversible).

## OAuth y seguridad

- Nunca se guarda una contraseña de Google — solo `accessToken` /
  `refreshToken` de OAuth 2.0, cifrados en reposo (ver
  [`NEXUS_SECURITY.md`](NEXUS_SECURITY.md)).
- Si un token vence o el proveedor revoca acceso, `Integration.status`
  pasa a `ERROR` con `errorMessage`, y la pantalla de Settings lo muestra
  en vez de fallar en silencio la próxima vez que NexusBrain intente usar
  esa tool.
- El producto nunca depende completamente de una integración externa: si
  Google Calendar está desconectado, el calendario nativo de NEXUS sigue
  funcionando igual.
