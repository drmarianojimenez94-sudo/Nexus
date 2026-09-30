# Nexus Voice Console

La versión web abre el asistente después de autenticar al usuario. Es la misma aplicación que puede abrirse desde Safari en iPhone y desde Chrome/Edge en Windows. Ajustes → Voz de Nexus permite desactivar la apertura automática; el enlace `/today?listen=1` sigue abriendo la consola.

## Qué cambia

- Consola de pantalla completa con núcleo, anillos y estados de escucha, procesamiento, respuesta y error. La onda es una animación de estado, no una medición del volumen del micrófono.
- Intenta escuchar inmediatamente. Si el navegador exige interacción o permiso, muestra Activar voz; no intenta eludir las restricciones del sistema.
- Después de una respuesta vuelve a escuchar. El silencio reinicia el reconocimiento con una pausa breve. Errores de permiso, red o servicio requieren reintento explícito.
- Detiene el reconocimiento antes de hablar para evitar que Nexus se escuche a sí mismo. Permite interrumpir la respuesta mediante un botón.
- Pausa al ocultar la página y libera escucha/voz al cerrar. No mantiene escucha en segundo plano.
- Ofrece entrada escrita en la misma consola cuando la voz no está disponible.
- La IA diferencia conversación de acciones, conserva los últimos doce mensajes durante la sesión y recibe recuerdos y tareas del usuario autenticado. Las preguntas no se guardan automáticamente como notas.
- Un fallo de respuesta de la IA no dispara una segunda escritura en Inbox. Si pudo haberse ejecutado una acción, pide revisar el panel antes de repetirla.
- Muestra si la IA está configurada. Sin IA mantiene comandos básicos y captura explícita de notas.

## Servidor

Reutiliza el proveedor Anthropic existente. Configurar `AI_API_KEY` y, opcionalmente, `AI_MODEL` en el servidor de la API. La clave nunca se envía al navegador. No requiere migraciones de base de datos.

`GET /assistant/status` requiere autenticación y solo expone `aiConfigured`. `POST /assistant/interpret` admite texto y hasta doce mensajes de contexto de máximo 2000 caracteres cada uno.

## Alcance y límites

Esta entrega modifica la web; la app Expo nativa sigue en su estado anterior de lectura en voz alta. No incorpora envío de correos, reconocimiento nativo ni acceso nuevo a cuentas externas. Safari implementa reconocimiento mediante Web Speech, pero su disponibilidad depende de los permisos, la configuración de Siri y el entorno. Los navegadores integrados pueden no ofrecer el servicio. Probar en un iPhone real antes de publicar.

El contexto conversacional dura mientras la consola permanece abierta. No hay streaming de audio ni persistencia nueva de conversaciones. El proveedor puede pedir aclaraciones; las acciones siguen limitadas a tareas, eventos, recordatorios, recuerdos, notas y navegación existentes.

## Verificación

- Seis pruebas de regresión web: frases con hoy/gracias dentro de tareas, contexto de seguimiento, fallo ambiguo de API, conversación sin IA, captura explícita y cierre.
- Typecheck web y API, lint y build de producción web.
- Pruebas adicionales de API para conversación sin escritura, límites de historial y autenticación de estado; el CI existente dispone de PostgreSQL para ejecutarlas.
- La validación de micrófono real y Safari físico requiere pruebas en dispositivo. El navegador de prueba no pudo instalarse en este entorno; no se afirma una verificación visual automatizada.

La instalación local detectó que `shell-quote@1.11.0` no superaba el período mínimo de antigüedad de dependencias. Se fija la versión estable 1.8.3 en el workspace y lockfile, sin relajar la política. La lista de scripts de compilación autorizados existente también se declara para pnpm 11.

## Paneles visibles y consola persistente

Al pedir una sección (por ejemplo, «Nexus, abrime el calendario»), Nexus abre
la ruta real y reduce el asistente a una consola inferior. La conversación y
la escucha continúan; el documento vuelve a permitir desplazamiento y foco
normal. «Expandir» vuelve a la consola completa; «Ver mi panel» la reduce;
«Cerrar» apaga la sesión. «Pausar micrófono» mantiene la pausa aunque se
escriba un pedido o se cambie de panel.

La navegación explícita se resuelve localmente antes de consultar la IA,
incluso cuando la clave falta o el proveedor falla. Las frases que agregan
una acción, como «abrí el calendario y agendá una reunión», se envían al
intérprete completo para no perder la acción.

### Configuración del servidor

En Ajustes, «Inteligencia de Nexus» consulta `/assistant/status`. Este estado
comprueba que existe `AI_API_KEY`; no valida la clave ni el saldo del proveedor.
Los errores de conexión se muestran por separado. La consola actualiza el
estado al volver a la ventana.

1. Crear una clave de Claude API dentro del workspace de la cuenta.
2. En el servicio de Render, Environment, definir `AI_API_KEY` con esa clave.
3. Usar «Save and deploy» para aplicarla al proceso del servidor.
4. Volver a Ajustes y pulsar «Comprobar configuración»; probar una conversación.

No guardar credenciales en el repositorio, en campos del navegador ni en
variables `NEXT_PUBLIC_*`. La configuración existente de `AI_MODEL` se conserva.
