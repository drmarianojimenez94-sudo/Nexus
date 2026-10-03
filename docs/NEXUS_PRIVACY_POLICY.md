# Nexus — Política de privacidad (borrador para revisión legal)

> Borrador técnico redactado desde lo que el código hace hoy. Antes de publicar en App Store / Google Play debe revisarlo un abogado, completarse con los datos del responsable y registrarse la base ante la AAIP (Ley 25.326).

## Quién usa Nexus y para qué

Nexus es una herramienta para profesionales. En la vertical médica, el médico es el responsable de las historias clínicas que registra (Ley 26.529, art. 18). Nexus organiza su agenda, sus pacientes, consultas y pendientes. **No diagnostica, no prescribe y no reemplaza el criterio profesional.**

## Qué datos se tratan

- Cuenta del profesional: nombre, correo, contraseña (hash bcrypt), especialidad y matrícula si las carga.
- Datos de pacientes que el profesional registra: identificación, núcleo familiar, antecedentes, alergias, medicación, consultas, seguimientos. Son **datos sensibles** (Ley 25.326, art. 2 y 7).
- Turnos en la agenda: el título lleva solo iniciales del paciente.
- Registro de auditoría de accesos y cambios, sin texto clínico.

## Cómo se protegen

- Cifrado AES-256-GCM por registro clínico, con la identidad del usuario, el tipo y el id como datos asociados. Búsqueda por índices HMAC.
- HTTPS obligatorio en producción. Sesión con cookies httpOnly en la web y tokens en el almacenamiento seguro del sistema en el teléfono.
- En el teléfono: las fichas no se guardan en el dispositivo y el acceso se bloquea con Face ID, huella o código.
- La versión validada de una consulta queda inalterable; las correcciones se agregan como nuevas evoluciones.

## Voz, micrófono, contactos

- El micrófono se usa **solo mientras el profesional toca Dictar**. No hay escucha en segundo plano. El audio no se guarda.
- El reconocimiento de voz usa el motor del sistema operativo, en el dispositivo cuando está disponible. Si no lo está, el sistema (Apple / Google) puede procesar el audio en sus servidores, según sus políticas.
- Antes de registrar una conversación con el paciente presente, el profesional debe confirmar que el paciente consintió. Nexus no lo afirma por su cuenta.
- Los contactos se abren con el selector del sistema solo cuando el profesional elige uno; Nexus no lee ni sube la agenda.

## Inteligencia artificial

- El asistente clínico interpreta el dictado con reglas propias en el servidor de Nexus: **los datos de pacientes no se envían a proveedores de IA externos.**
- Si el asistente general detecta datos de un paciente, los deriva al asistente clínico en lugar de enviarlos a la IA externa o al inbox.
- Ningún dato se usa para publicidad ni para entrenar modelos.

## Conservación y derechos

- Las historias clínicas se conservan al menos 10 años desde la última actuación (Ley 26.529, art. 18). El profesional puede exportar la historia completa de un paciente (JSON) e imprimirla.
- El paciente es titular de su historia y puede pedir copia al profesional (art. 14).
- Acceso y rectificación: disponibles desde la app. La supresión de datos clínicos está limitada por la obligación legal de conservación.
- **Pendiente antes de publicar:** borrado de cuenta desde la app (App Store 5.1.1(v)), resolviendo antes la entrega o custodia de las historias que el profesional debe conservar.

## Tiendas

- App Store: categoría Medical; sin HealthKit ni copia de datos de salud en iCloud; textos de permiso específicos.
- Google Play: declaración de apps de salud y sección de Seguridad de los datos a completar con lo descripto arriba.
