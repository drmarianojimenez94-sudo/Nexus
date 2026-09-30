# Google en Nexus

Desde Ajustes → Correo, contactos y archivos se puede buscar y leer correo, crear un borrador, revisar destinatario/asunto/contenido y enviarlo mediante confirmación explícita. Los contactos admiten búsqueda por nombre, correo y teléfono; la ficha muestra organización y permite iniciar un borrador con la dirección seleccionada. Drive permite buscar archivos por nombre, ver metadatos y leer Google Docs, texto, Markdown, CSV y JSON. La lectura de archivos está limitada a 100 KB; otros formatos se abren en Drive.

Estas operaciones requieren la cuenta Google del usuario conectado a Nexus. No importan correos, documentos ni contactos al consultorio y no pasan sus contenidos al asistente de IA. No se sincroniza información clínica con Google. No se adjuntan documentos a correos ni se envían mensajes por voz en esta versión.

## Activación en el servidor

1. Habilitar Gmail API, People API, Google Drive API y Calendar API en el proyecto Google Cloud del cliente OAuth.
2. Configurar la pantalla de consentimiento y un cliente OAuth web. Para una aplicación en pruebas, agregar las cuentas que van a probarla como usuarios de prueba.
3. Cargar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` en el servidor. La URI autorizada debe coincidir exactamente con el callback público, por ejemplo `https://TU-NEXUS/api/connectors/google/callback`.
4. Conectar desde Ajustes o seleccionar **Conectar o ampliar permisos de Google** para una cuenta ya vinculada con Calendar. No alcanza con un despliegue: cada usuario debe conceder los permisos nuevos.

El consentimiento solicita `calendar.readonly`, `gmail.readonly`, `gmail.compose`, `contacts.readonly` y `drive.readonly`. `gmail.compose` autoriza tanto borradores como envío; Nexus exige además revisar y confirmar cada envío en su propia interfaz. Estos permisos pueden requerir verificación de Google para distribución pública y no se puede prometer que una aplicación OAuth sin verificar esté habilitada para todos los usuarios.

## Protección y límites

- Credenciales cifradas en la tabla de integraciones; no se devuelven tokens al navegador.
- Solicitudes ligadas a usuario autenticado y encabezado de propietario, para detectar cambio de cuenta entre pestañas.
- OAuth conserva Calendar como permiso inicial; Workspace se solicita explícitamente y usa `prompt=consent`. El estado OAuth queda ligado al usuario que inició el flujo.
- Lecturas con `Cache-Control: no-store`. Contenido de correo en texto simple: no se ejecuta HTML remoto ni se cargan adjuntos.
- Confirmación de envío firmada, válida diez minutos y ligada a usuario, identificador de borrador y representación exacta almacenada. Un borrador modificado en Gmail se rechaza. Para retomarlo, revisarlo en Gmail o crear uno nuevo desde Nexus.
- El envío utiliza la representación revisada y no reintenta automáticamente una operación incierta. Ante un error durante envío, revisar **Enviados** en Gmail antes de volver a enviar.
- Las acciones de creación/envío se registran en auditoría sin cuerpo de mensaje ni credenciales. Google y la base de datos local no comparten una transacción; el envío puede haber ocurrido aunque falle un registro local.
- Los contactos muestran los datos de Google en el momento de la consulta, sin aprendizaje automático de relaciones personales. Los resultados admiten páginas; la búsqueda de People devuelve hasta veinte coincidencias según sus límites.

Pruebas automáticas usan respuestas simuladas del proveedor y una base descartable. No envían correos reales ni prueban credenciales reales. La activación final requiere una prueba manual del consentimiento y un borrador controlado con la cuenta del usuario.

## Referencias oficiales

- [Google OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Crear borradores Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create)
- [Enviar borradores Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/send)
- [Buscar contactos](https://developers.google.com/people/api/rest/v1/people/searchContacts)
- [Descargar y exportar archivos Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
