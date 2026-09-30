# Nexus: consolidación web

La entrega sigue siendo una web. No se publica ni completa una aplicación nativa en esta ronda. La API acepta cookies web y Bearer para un futuro cliente nativo; tipos y validaciones compartidos quedan en packages/shared. Las solicitudes verifican propietario, los cambios usan versiones y los documentos validados conservan snapshots históricos.

## Implementado

- Borradores de consulta independientes con UUID en URL, recuperación cifrada por paciente y bloqueo exclusivo entre pestañas. Sin Web Locks, abre en lectura para impedir sobrescrituras. Borradores antiguos se recuperan explícitamente. Conflictos muestran versión local y servidor para elegir contenido.
- Plantillas: búsqueda, favoritos, archivo/restauración, edición en nuevas versiones e historial. Cada consulta conserva su plantilla histórica.
- Historial paginado con filtros de fecha, estado, plantilla y texto; fichas activas/archivadas/todas y resumen longitudinal imprimible. Seguimientos editables con versiones.
- Mutaciones clínicas y su auditoría se confirman en la misma transacción. Creación de pacientes, plantillas, seguimientos y proyectos admite identificador idempotente. El arranque reconcilia índices cifrados de documentos antiguos, preservando documentos alfanuméricos y búsqueda sin puntuación. Si la clave es incorrecta, no arranca.
- Proyectos: nombre, descripción, tareas pendientes/completadas y progreso real. Dictado y explicación se organizan como borrador editable; el usuario revisa antes de guardar. Si se usa IA requiere activación explícita y configuración; la alternativa sin IA interpreta secciones Proyecto, Descripción y Pendientes. La voz general puede abrir este flujo diciendo «crear un proyecto…».
- Google: Gmail buscar/leer, crear borrador y enviar solo tras revisión concreta; contactos buscar; Drive buscar y leer texto admitido. El OAuth solicita permisos adicionales y requiere volver a autorizar la cuenta. No se envía contenido Google al modelo ni al consultorio automáticamente.

## Activación externa que requiere la cuenta del propietario

GOOGLE_CLIENT_ID/SECRET y redirect URI deben estar configurados en el servicio. En Google Cloud activar Gmail, People y Drive, autorizar el redirect y habilitar los permisos utilizados. Conectar Google desde Nexus para consentir los permisos. La implementación está preparada, pero no se afirma que esas APIs hayan sido activadas ni que se hayan probado correos reales.

El Blueprint gratuito sigue siendo un entorno de pruebas. Elegir almacenamiento duradero y retención de copias antes de usarlo como archivo real requiere configurar el proveedor. No se cambió el plan de Render ni la cuenta de facturación.

## Copias y restauración

`node scripts/backup.mjs backup destino.nexusbak` usa DATABASE_URL y NEXUS_BACKUP_KEY (mínimo 32 caracteres aleatorios), pg_dump compatible y salida cifrada AES-256-GCM, privada y sin sobrescribir archivos. La herramienta admite copias de hasta 512 MiB en memoria; para conjuntos mayores se necesita un pipeline de streaming. Guardar fuera del servidor el archivo y la clave de copia, junto con las claves originales CLINICAL_DATA_KEY/AUTH_SECRET. El cifrado de la copia no reemplaza las claves originales de los registros.

`node scripts/backup.mjs restore archivo.nexusbak` requiere RESTORE_DATABASE_URL hacia una base aislada vacía. Verifica autenticidad antes de restaurar; rechaza destino con tablas. No usa DROP ni reemplaza producción. Requiere pg_restore/psql compatibles y espacio temporal privado; borra el dump temporal al terminar.

CI prueba migraciones, suite completa, creación de copia cifrada, restauración en otra base y descifrado del paciente de prueba con sus claves. Esto prueba la recuperación del software, no una copia de producción ni la retención del proveedor.

## Preparación nativa

La futura app puede consumir la misma API y sus schemas. Debe enviar X-Nexus-Client: mobile al autenticar, conservar tokens en almacén seguro y X-Nexus-Owner en operaciones protegidas; renovar tokens sin duplicar escrituras y respetar versiones/idempotencia. Los permisos de micrófono y reconocimiento deben implementarse en cada plataforma. No se afirma que la web escuche en segundo plano ni que sustituya una prueba en iPhone físico.

Rama de trabajo: codex/nexus-release-audit. Se mantiene separada de main para que el usuario pruebe la versión existente. El PR documenta resultados de la verificación final y cualquier límite detectado.
