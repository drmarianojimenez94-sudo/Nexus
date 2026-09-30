# Nexus — Pacientes y consultorio

## Flujo

Pacientes → Nuevo paciente → Nueva consulta → elegir plantilla → completar o dictar un fragmento → revisar → Guardar borrador en Nexus → Revisar y validar.

Los campos vacíos nunca se convierten en hallazgos normales. El dictado se acumula separado, y el médico elige a qué campo incorporarlo. La transcripción puede equivocarse en medicamentos, unidades y negaciones: debe revisarse antes de validar.

La validación conserva una versión que ya no puede editarse. Las correcciones se registran como nuevas evoluciones. No implementa firma digital, receta electrónica ni certificación legal de historia clínica.

La rama de consolidación conserva, al validar, una copia cifrada de la identificación del paciente y del profesional. Los documentos anteriores sin esa copia lo indican explícitamente. Antes de validar, la transcripción pendiente debe incorporarse a los campos o vaciarse tras revisarla. Los seguimientos tienen paginación y recuento completo. La auditoría y pendientes para la versión definitiva están en `NEXUS_RELEASE_AUDIT.md`.

En una ficha se pueden agregar controles, resultados a revisar y llamadas. El panel Seguimientos muestra pendientes y vencidos, y permite resolver/reabrir. No envía datos clínicos por correo ni los copia a Google Calendar.

## Plantillas y documentos

Hay seis plantillas base versionadas. En Plantillas, «Usar como base» permite crear una variante con campos propios. Las consultas guardan una copia de la plantilla usada, para preservar su estructura.

«Ver documento guardado» muestra la versión del servidor, no los cambios locales sin guardar. Desde allí se puede imprimir o guardar PDF usando el navegador, o descargar texto. Las fichas exportan el historial completo en JSON; la pantalla muestra las últimas 100 consultas. Las exportaciones descargadas contienen datos identificables: deben guardarse en un destino controlado por el médico.

## Almacenamiento y aislamiento

- PostgreSQL: identificación y contenido de pacientes, consultas, plantillas personales y seguimientos cifrados con AES-256-GCM. El AAD vincula cada registro a su usuario, tipo e identificador.
- La búsqueda usa hashes HMAC de prefijos de nombres/documentos. Los nombres no aparecen en los índices de búsqueda, pero estos revelan igualdad de tokens dentro de una cuenta.
- La clave deriva de `CLINICAL_DATA_KEY` si se configura, o de `AUTH_SECRET` con un dominio independiente. **No cambiar ninguna clave usada por registros existentes sin un proceso de recifrado y copia de seguridad.** Guardar las claves fuera de la base; un backup sin ellas no puede recuperar los registros.
- API clínica autenticada, con filtro por usuario y `Cache-Control: no-store, private`. Auditoría de accesos y cambios sin texto clínico en metadata.
- Consultas y fichas usan versiones: una edición antigua recibe 409 y no sobrescribe otra más reciente.
- Borradores del dispositivo: IndexedDB con AES-GCM y clave no extraíble por usuario, también en IndexedDB. Esta protección evita texto plano en un volcado de almacenamiento; no protege frente a XSS o un navegador comprometido. Solo usar dispositivos de confianza. El borrador se conserva hasta guardar en el servidor. Al volver a entrar se recupera; si la versión del servidor cambió no se sobrescribe automáticamente.
- Las fichas no entran en Memory, Inbox, tareas ni contexto del asistente personal. El asistente general no se abre en las rutas clínicas; el dictado clínico usa su propio flujo sin IA generativa.
- El reconocimiento de voz del navegador puede enviar audio a terceros. Para evitarlo, usar entrada escrita o un servicio de dictado cuya configuración y contrato hayan sido verificados. No se afirma que el dictado actual sea exclusivamente local.

## Despliegue y copias

La nueva migración es aditiva: `20260930110000_clinical_workspace`. El arranque existente de Render aplica `prisma migrate deploy`; no usar `migrate reset` en producción.

Antes de registrar información real, comprobar HTTPS, políticas del alojamiento y de cualquier proveedor de dictado, acceso a dispositivos, copia de seguridad de PostgreSQL y restauración con las claves correctas. No hay verificación contractual ni certificación de cumplimiento por parte de este cambio. El módulo funciona sin habilitar IA clínica; no usar Gemini API para práctica clínica según las restricciones del proveedor documentadas en la auditoría.

Crear un backup con la herramienta del proveedor o `pg_dump` hacia almacenamiento privado. Conservar y probar una restauración en un entorno aislado, junto con las claves. La configuración gratuita de Render del repositorio es para pruebas y no debe considerarse un sistema duradero de archivo médico.

## Fiabilidad del asistente personal

Las capturas sin conexión se vinculan al usuario; los errores de autenticación o validación no las eliminan. La sincronización usa un identificador idempotente y verifica el propietario esperado. Las capturas antiguas sin dueño requieren que el usuario las reclame explícitamente. Un error de almacenamiento ya no produce un mensaje de guardado exitoso.

Los recordatorios distinguen PENDING/SENDING/FAILED/SENT. Se marcan enviados solo después de una respuesta exitosa, tienen reintentos con espera creciente y una concesión temporal recuperable. Resend recibe una clave idempotente. La interfaz de Agenda permite consultar el estado y programar otro intento. Esto no garantiza entrega al buzón ni puntualidad en un servicio dormido; se requiere configurar correo y el proceso de despacho.

## Colores

Adaptativo combina sección y hora local del dispositivo: Pacientes verde, Agenda dorado, Proyectos violeta; Inicio dorado de 05:00 a 11:59, cian de 12:00 a 18:59 y violeta el resto del día. Hay modos solo por horario, solo por sección y cuatro colores fijos. Los avisos de peligro siguen rojos y las advertencias ámbar. No cambia la disposición de las pantallas.
