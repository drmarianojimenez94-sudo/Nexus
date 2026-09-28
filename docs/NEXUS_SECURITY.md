# NEXUS — Security

## Implementado en Fase 1

- **Contraseñas**: `bcryptjs`, 12 rounds. Nunca se guarda ni se loguea la
  contraseña en texto plano (`apps/api/src/lib/auth.ts`).
- **Sesiones**: JWT de acceso de vida corta (15 min por defecto) +
  refresh token opaco de vida larga (30 días), ambos en cookies
  `httpOnly`, `sameSite=lax`, `secure` en producción. El refresh token
  nunca se guarda en texto plano server-side: se persiste su hash SHA-256
  (`refresh_tokens.tokenHash`), igual que se hace con contraseñas.
- **Revocación**: `/auth/logout` revoca el refresh token actual;
  `/auth/refresh` rota el token (revoca el usado, emite uno nuevo) — un
  token robado y reusado después de una rotación legítima ya no sirve.
- **Autorización server-side**: toda ruta de dominio (`/tasks`,
  `/projects`, etc.) filtra por `userId` extraído del JWT verificado en
  el propio servidor — nunca se confía en un `userId` que venga del
  cliente en el body o la URL. Ver `authenticate` middleware
  (`apps/api/src/middleware/authenticate.ts`) y el patrón repetido en
  cada ruta (`findFirst({ where: { id, userId } })` antes de mutar).
- **Validación de entrada**: Zod en el borde de cada endpoint
  (`packages/shared`), nunca se confía en el shape del body.
- **Rate limiting**: `express-rate-limit` — límite estricto en
  `/auth/login` (10 intentos / 15 min) y uno general en el resto de la
  API (120 req/min) para mitigar fuerza bruta y abuso.
- **Cabeceras**: `helmet` con la configuración por defecto (CSP básica,
  `X-Content-Type-Options`, etc.).
- **CORS**: whitelist explícita vía `API_CORS_ORIGINS`, con
  `credentials: true` solo para esos orígenes — el API no acepta cookies
  de cualquier origen.
- **Auditoría**: toda escritura relevante (crear/actualizar/borrar
  tarea, proyecto, evento, recordatorio, registro/login) queda en
  `audit_log` con `userId`, acción, entidad afectada y metadata —
  implementado desde el primer endpoint, no como agregado posterior.
- **Secretos**: `.env` está en `.gitignore`; `.env.example` documenta
  nombres de variables sin valores reales; no hay ninguna API key ni
  connection string real committeada en el repositorio.

## Pendiente / diseñado para fases posteriores

- **Cifrado de tokens OAuth en reposo** (`integrations.accessToken` /
  `refreshToken`): estas columnas existen desde Fase 1 pero no se usan
  hasta Fase 4 (Connectors); antes de guardar el primer token real hay
  que agregar cifrado a nivel de aplicación (no solo TLS + disco cifrado
  del proveedor de base de datos).
- **2FA**: no implementado en Fase 1; el modelo de `devices` está pensado
  para eventualmente distinguir dispositivos de confianza.
- **Backups**: dependen del proveedor de Postgres elegido (Neon hace
  point-in-time recovery); no hay un mecanismo propio de backup en el
  repositorio todavía porque no hay entorno de producción desplegado.
- **Deshacer acciones de NexusBrain** (brief §46): el modelo `AiAction`
  guarda el estado necesario (`planned`/`executed`/`undone`) para
  soportar undo, pero la lógica de "cómo deshacer cada tool" se
  implementa junto con cada tool en Fase 3, no de forma genérica.

## Principio general

Nivel 0–1 (conversación, lectura) ejecuta directo. Nivel 2 (acción
reversible) ejecuta y ofrece deshacer. Nivel 3 (comunicación externa)
siempre muestra confirmación antes de ejecutar. Nivel 4 (financiero,
legal, médico, destructivo) nunca se ejecuta sin confirmación explícita,
sin excepción, sin importar qué tan alta sea la confianza del modelo.
Estos niveles están definidos en código
(`packages/shared/src/permissions.ts`) desde la Fase 1 para que no se
puedan "olvidar" al construir NexusBrain.
