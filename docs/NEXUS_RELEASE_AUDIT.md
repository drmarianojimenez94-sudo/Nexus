# Nexus — Auditoría para consolidar la versión web

Fecha: 30/09/2026. Base: `main` en `f5328d1617eabf6fb50ac058f25163ffe3c9a528`. Rama: `codex/nexus-release-audit`.

## Dictamen

Nexus tiene una base web funcional y un módulo clínico integrado; todavía no corresponde llamarlo versión definitiva. Esta revisión combina tres revisores de código con enfoques médico/producto, interfaz/accesibilidad y seguridad/consistencia, más integración y comprobaciones del responsable. No representa certificación médica ni auditoría externa independiente. No se accedió a pacientes reales ni al servicio de producción.

La rama parte del main actual y por ello contiene pacientes, consultas, seis plantillas base (primera consulta, evolución, urgencias, enfermedad crónica, derivación e indicaciones), plantillas personales, seguimientos, documentos y colores por sección/hora. Esta ronda agrega correcciones; no duplica el módulo. Main queda disponible para pruebas y esta rama no se fusiona automáticamente.

## Correcciones incluidas

| Prioridad | Problema encontrado | Comportamiento corregido |
|---|---|---|
| P0 | Navegar A→B con red lenta podía mostrar A con acciones dirigidas a B. Respuestas fuera de orden podían reemplazar la ficha actual. | La carga se vincula a su ruta, se descartan respuestas abandonadas y la ficha comprueba que su id coincida antes de ofrecer acciones. El formulario se identifica por paciente y versión. |
| P1 | Editar nombre/documento del paciente o nombre del profesional modificaba la identificación de un documento validado. | Al validar se cifran copias de la identidad del paciente y profesional; el documento y exportación las conservan. Registros anteriores sin copia histórica se identifican explícitamente, sin inventar información retrospectiva. |
| P1 | Podía validarse una consulta con transcripción pendiente y luego quedar oculta. | API y editor exigen incorporar o descartar el texto pendiente antes de validar. Documentos antiguos con texto residual lo muestran y exportan. |
| P1 | Una pestaña con cuenta A podía enviar información clínica después de iniciar B en otra pestaña. | Las solicitudes web clínicas llevan el propietario esperado; el servidor rechaza discrepancias. Un cambio de sesión notifica otras pestañas, limpia la sesión visual y recarga la cuenta. El propietario original se conserva en los reintentos. |
| P1 | Dos rotaciones simultáneas del mismo refresh token podían crear sesiones sucesoras válidas. | La revocación condicional y creación del sucesor ocurren en una transacción. Solo una solicitud gana. |
| P1 | Los seguimientos después de los primeros 200 eran invisibles. | Lista paginada de 50, recuento completo y navegación anterior/siguiente por estado y paciente. |
| P2 | Cambiar plantilla borraba campos sin confirmación y podía dejar un destinatario de dictado ajeno a la nueva plantilla. | Confirmación antes de descartar contenido, limpieza del destinatario y comprobación de pertenencia del campo. |
| P2 | El médico debía abandonar la consulta para consultar alergias y medicación de ficha. | Panel contextual con edad, alergias, medicación y antecedentes. Vacío significa no registrado; no se convierte en un hallazgo normal. |
| P2 | Era posible escribir durante el guardado de ficha y perder las últimas modificaciones. | Campos bloqueados mientras se guarda. |
| P2 | La confirmación de validación no bloqueaba fondo ni administraba foco. | Diálogo modal nativo, Escape, foco inicial y retorno al cerrar. |

## Pendientes para la versión definitiva, en orden

1. **P1 — Borradores independientes y recuperación guiada.** Todas las consultas nuevas de un mismo paciente comparten el slot local `patientId:new`. Abrir dos pestañas puede recuperar el mismo clientId, sobrescribir un borrador o continuar la misma consulta sin intención. Incorporar un id estable por borrador en URL, listado de borradores por paciente y coordinación entre pestañas. Se mantiene pendiente en esta ronda; probar una consulta nueva por paciente a la vez hasta resolverlo.
2. **P1 — Archivo duradero y recuperación probada.** El Blueprint sigue usando PostgreSQL gratuito para pruebas. Pasar a almacenamiento con retención y copias, custodiar las claves y realizar una restauración comprobada. La rama no cambia planes ni factura recursos.
3. **P2 — Escritura y auditoría atómicas e idempotencia ampliada.** Algunas mutaciones escriben primero y auditan después; un fallo de auditoría puede responder 500 aunque el registro exista. Un reintento puede duplicar seguimientos. Llevar las dos escrituras a una transacción y usar claves idempotentes también en fichas, plantillas y seguimientos.
4. **P2 — Plantillas gestionables.** Actualmente se crean y clonan, sin editar/archivar/favoritos; las copias nuevas empiezan en versión 1. Agregar edición versionada, archivo, búsqueda y elección directa desde paciente. Conservar las estructuras históricas de consultas. Validar cantidad de campos antes de enviar y comunicar éxito de creación.
5. **P2 — Historia longitudinal navegable.** La ficha muestra últimas 100 consultas y permite exportación completa JSON; faltan paginación histórica, búsqueda por fechas/estado/plantilla y resumen imprimible de ficha. Separar registro profesional de documento de indicaciones para paciente.
6. **P2 — Identificación documental.** Normalización de documentos con letras conserva solo dígitos cuando hay números: AB123 y CD123 pueden colisionar. Definir tipo de documento y normalización coherente, preservando DNI con puntuación.
7. **P2 — Conflictos de edición.** El bloqueo por versión evita sobrescrituras, pero requiere copiar y recargar manualmente. Agregar comparación local/servidor y recuperación de campos. Mejorar filtros de activos/archivados y edición de fecha/título de seguimientos.
8. **Producto — Integraciones y voz.** Google Calendar existe. Gmail, Contacts y Drive no están implementados. Completar conexión y acciones revisables, sin incorporar registros clínicos al asistente personal. Probar dictado y permisos en un iPhone físico: la simulación de interfaz no valida micrófono real ni precisión de transcripción.
9. **Posterior — Aplicación nativa.** La base Expo/React Native contiene autenticación y Today/TTS, sin equivalencia clínica ni dictado completo. Consolidar primero la web, luego pacientes/consultas/plantillas, voz y notificaciones en móvil usando las mismas cuentas y servidor.

## Verificación

- Lint y tipos de todos los paquetes; build de producción web.
- Pruebas web de respuestas invertidas, invalidación al abandonar rutas, propietario estable durante renovación y bloqueo sin propietario conocido; junto a cola offline, colores y comandos.
- Pruebas API nuevas: rotación simultánea de refresh, identidad histórica congelada tras editar ficha/profesional, rechazo de dictado pendiente, propietario incorrecto y acceso a seguimientos más allá de la primera página.
- PostgreSQL local no estuvo disponible durante esta ronda; la verificación final de integración y migraciones se ejecuta en GitHub Actions con PostgreSQL efímero. Consultar el resultado del PR.
- Simulación de interfaz con API controlada: creación de ficha, recuperación de borrador, guardado, validación, documento y seguimiento; tamaños 320, 390 y 1440 px. Esta simulación no verifica despliegue real, proveedores externos ni audio de iPhone.

## Cómo probar

En main se puede probar lo clínico ya integrado. Para las correcciones de esta ronda, revisar el PR y usar un despliegue de prueba apuntando a `codex/nexus-release-audit`, con base de datos de prueba. No cambiar la rama del servicio principal si se quiere continuar usando main allí.

Casos prioritarios: abrir A y luego B con red lenta; cambiar cuenta desde otra pestaña antes de guardar; validar y luego cambiar la ficha para comprobar documento histórico; dejar dictado pendiente e intentar validar; cambiar plantilla con contenido y cancelar; recorrer varias páginas de seguimientos; guardar ficha e intentar escribir durante el envío; abrir/cerrar validación con teclado.
