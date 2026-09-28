# NEXUS — Connectors (Fase 4)

**Google Calendar está implementado** (`apps/api/src/routes/connectors.ts`,
`lib/googleCalendar.ts`, `lib/tokenCrypto.ts`, panel en Settings). Gmail,
Contacts y Drive todavía no — siguen el mismo patrón descrito abajo, y
reusan las mismas credenciales OAuth (solo agregan scopes nuevos). La
tabla `integrations` y el enum `IntegrationStatus`
(`NOT_CONNECTED` / `CONNECTED` / `ERROR`) existen desde Fase 1 para que
Settings → Integrations tenga dónde leer estado.

## Cómo activar Google Calendar (paso a paso)

1. Andá a [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (creá un proyecto nuevo ahí si no tenés uno — es gratis).
2. "Enable APIs and services" → buscá **Google Calendar API** → Enable.
3. "Create Credentials" → **OAuth client ID** → tipo **Web application**.
4. En "Authorized redirect URIs" agregá exactamente:
   `https://<tu-dominio-de-Nexus>/api/connectors/google/callback`
   (con tu app corriendo local: `http://localhost:3000/api/connectors/google/callback`).
5. Copiá el **Client ID** y el **Client Secret** que te da Google.
6. En Render (o tu `.env` local): cargá `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` (la misma URL del paso 4)
   como variables de entorno del servicio.
7. Recargá Settings en la app → el panel de Integrations ya no dice "no
   configurado" → botón **Conectar**.

Nada de esto es obligatorio — sin estas tres variables, Settings explica
que falta configurarlo y el resto de NEXUS sigue funcionando exactamente
igual, mismo principio que `AI_API_KEY`.

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

## NEXUS Home (smart home / IoT) — no está en el brief original, agregado por dirección de producto

El usuario quiere controlar dispositivos Bluetooth comprados a futuro
desde NEXUS, corriendo en el iPhone. Antes de diseñar esto como un
conector más, hay un hecho técnico que condiciona toda la arquitectura:

**Web Bluetooth no existe en iOS, en ningún navegador, sin excepción.**
Apple no lo implementa en WebKit, y todo navegador en iOS (Chrome,
Firefox, lo que sea) está obligado a usar WebKit — así que ninguna PWA ni
página web puede hablarle a un dispositivo Bluetooth directamente desde
un iPhone. Esto no es un bug de NEXUS ni algo que se arregle con más
código; es una decisión de plataforma vigente desde hace años.

La solución no es esperar a la app nativa — es la arquitectura correcta
de todas formas: los dispositivos Bluetooth se conectan a un **hub**
(Home Assistant, HomeKit, SmartThings, o el hub del fabricante), y NEXUS
le habla a ese hub por su API, exactamente con el mismo patrón que
`NexusConnector` ya define para Google:

```ts
interface NexusConnector {
  readonly provider: "google_calendar" | "gmail" | "google_contacts" | "google_drive" | "nexus_home";
  // ...
}
```

`nexus_home` (nombre de trabajo) hablaría con una instancia de **Home
Assistant** self-hosted (gratis, soporta prácticamente cualquier marca de
dispositivo Bluetooth/Zigbee/Wi-Fi vía sus integraciones) usando su API
REST/WebSocket local — no necesita que el teléfono tenga Bluetooth
prendido ni esté cerca de nada. Tools que expondría: `listDevices()`,
`getDeviceState(id)`, `setDeviceState(id, state)` — mismo patrón de
permisos que el resto (encender una luz es Nivel 2, reversible; algo como
abrir una cerradura sería Nivel 4, crítico).

Esto entra al roadmap como parte de la Fase 4 (Connect), en paralelo a
Google — no bloquea nada de lo que ya existe, y significa que cuando el
usuario compre los dispositivos, el paso es "instalar Home Assistant en
algo de la casa (una Raspberry Pi alcanza) y emparejarlos ahí", no
"esperar una app nativa de NEXUS".

## OAuth y seguridad

- Nunca se guarda una contraseña de Google — solo `accessToken` /
  `refreshToken` de OAuth 2.0, **cifrados en reposo** (AES-256-GCM,
  `lib/tokenCrypto.ts` — implementado, ver [`NEXUS_SECURITY.md`](NEXUS_SECURITY.md)).
- Si un token vence o el proveedor revoca acceso, `Integration.status`
  pasa a `ERROR` con `errorMessage`, y la pantalla de Settings lo muestra
  en vez de fallar en silencio la próxima vez que NexusBrain intente usar
  esa tool. Implementado para Google Calendar en el flujo de sync.
- El producto nunca depende completamente de una integración externa: si
  Google Calendar está desconectado, el calendario nativo de NEXUS sigue
  funcionando igual.
