# Nexus en tu iPhone, paso a paso

La app nativa ya está preparada: permisos, identificador, iconos y configuración de compilación. Para instalarla en un iPhone, Apple exige dos cuentas a tu nombre y una compilación en la nube. Las cuentas solo las podés crear vos: tienen tu identidad y un pago.

Tiempo total: unos 45 minutos de trabajo tuyo, más la espera de aprobación de Apple (de unas horas a 2 días).

---

## 1. Lo que necesitás (una sola vez)

| Qué | Para qué | Costo |
|---|---|---|
| **Apple Developer Program** — [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) | Sin esta cuenta, Apple no deja instalar apps propias en un iPhone fuera de la App Store | US$ 99 por año |
| **Cuenta de Expo** — [expo.dev/signup](https://expo.dev/signup) | Compila la app en la nube (no hace falta una Mac con Xcode) | Gratis |
| **Una computadora** (Mac o Windows) con [Node.js 22](https://nodejs.org) | Solo para la primera compilación, que crea los certificados de Apple | — |
| La **dirección de tu Nexus en Render** (la que abrís en el navegador) | La app se conecta a ese servidor | — |

> Inscribite en Apple Developer como **Individual** con tu Apple ID. Apple puede pedir verificar tu identidad; la aprobación tarda entre horas y 2 días.

---

## 2. Primera compilación (desde la computadora)

Abrí una terminal: en Mac, la app *Terminal*; en Windows, *PowerShell*. Pegá estos comandos de a uno:

```bash
git clone https://github.com/drmarianojimenez94-sudo/Nexus.git
cd Nexus
corepack enable
pnpm install
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Qué te va a pedir y qué contestar:

1. `login`: tu usuario y contraseña de expo.dev.
2. `init`: «Create a project?» → **Yes**. Esto agrega el identificador del proyecto a `app.json`.
3. `build`:
   - «Log in to your Apple account?» → **Yes**. Escribí tu Apple ID y el código de verificación que llega al iPhone.
   - «Generate a new Apple Distribution Certificate / Provisioning Profile?» → **Yes** a todo.
   - Si pregunta por el identificador `ar.drmarianojimenez.nexus`, aceptá.
   - Al subir a App Store Connect te pide un nombre para la app. Si «Nexus» ya está tomado, usá **«Nexus Médico»** o similar.
4. La compilación tarda 15 a 30 minutos y después se sube sola a **TestFlight**. Apple la procesa en otros 10 a 30 minutos y te avisa por mail.

Para terminar, subí a GitHub el cambio que hizo `init` (o pedímelo y lo hago yo):

```bash
git add app.json && git commit -m "EAS project id" && git push
```

---

## 3. Instalarla en el iPhone

1. En el iPhone, instalá **TestFlight** desde la App Store.
2. Entrá a [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → tu app → **TestFlight** → *Internal Testing* → **+** → agregate con tu Apple ID.
3. Te llega un mail o una notificación de TestFlight: tocá **Instalar**. Nexus aparece en tu pantalla de inicio.

---

## 4. Primer uso

1. Abrí Nexus. En «Dirección de tu Nexus» escribí la dirección de Render, por ejemplo `nexus-xxxx.onrender.com`, y tocá **Probar y guardar**. Si Render estaba dormido, tarda hasta un minuto.
2. Entrá con tu mismo mail y contraseña de la web.
3. Tocá el **botón grande del micrófono** y aceptá todos los permisos que pida, en cada caso **una sola vez**:
   - **Micrófono y reconocimiento de voz**: para dictar. Con «Listo» termina.
   - **Ubicación** (mientras se usa la app): para el clima de donde estás y las búsquedas cercanas. Solo se usa la ciudad.
   - **Calendario**: copia tus turnos al calendario del iPhone, solo con iniciales del paciente.
   - **Notificaciones**: alarmas y resumen del día.
   - **Contactos**: solo cuando elegís uno.
   - **Face ID**: para bloquear las fichas.
4. Si negaste algo por error: **Ajustes del iPhone → Nexus** y activalo.

### Qué queda conectado

| Del iPhone | Qué hace Nexus |
|---|---|
| Micrófono | Dictado continuo: las pausas no cortan. Termina con «Listo». Si el sistema corta el micrófono, lo dicho queda guardado y podés seguir. |
| Ubicación | El clima donde estás y las búsquedas cercanas («farmacia de turno»). |
| Calendario | Turnos y eventos en el calendario del iPhone. |
| Alarmas | Apple no deja que otras apps creen alarmas en el Reloj, así que Nexus programa un **aviso con sonido** a esa hora. |
| Notificaciones | Alarmas, recordatorios y resumen de «Mi día». |
| Contactos | Teléfonos de pacientes o colegas. |
| Face ID | Protege las fichas de tus pacientes. |
| Gmail y Google Calendar | Por la conexión con Google hecha una vez en la web ([guía](NEXUS_DESPLIEGUE.md#13-conectar-gmail-y-google-calendar-una-vez)). |
| Internet | Clima, noticias, cotizaciones, horarios: preguntale a Nexus. |

**Atajo con Siri:** abrí la app *Atajos* → **+** → *Abrir app* → Nexus → nombralo «Nexus dictar». Después decís «Oye Siri, Nexus dictar».

---

## 5. Versiones nuevas, sin computadora

Cuando haya cambios en la app, compilala desde el navegador del celular:

1. **Una vez**: en [expo.dev](https://expo.dev) → tu cuenta → *Account settings* → **Access tokens** → *Create*. Copiá el token.
2. **Una vez**: en GitHub, en el repositorio Nexus, entrá a **Settings → Secrets and variables → Actions** → *New repository secret*. Nombre: `EXPO_TOKEN`. Valor: el token.
3. **Cada vez**: GitHub → **Actions** → **App iPhone (EAS)** → *Run workflow* → `testflight`. En unos 40 minutos TestFlight te ofrece la actualización.

Los cambios de la web y del servidor (Render) **no necesitan** una app nueva: el iPhone los usa al instante.

> Las versiones de TestFlight vencen a los 90 días: antes de eso, repetí el paso 3.

---

## 6. Si algo falla

| Problema | Qué hacer |
|---|---|
| «No pude conectarme» al guardar la dirección | Abrí la misma dirección en Safari. Si carga, esperá un minuto (Render despierta) y probá de nuevo. |
| El micrófono no arranca | Ajustes del iPhone → Nexus → activá *Micrófono* y *Reconocimiento de voz*. Además, Ajustes → Siri: activá *Dictado*. |
| El clima no usa tu ciudad | Ajustes del iPhone → Nexus → *Ubicación* → «Mientras se usa la app». |
| El build falla por el identificador | El identificador `ar.drmarianojimenez.nexus` ya existe en otra cuenta: cambialo en `apps/mobile/app.json` (`ios.bundleIdentifier`) y repetí el `build`. |
| La IA no responde | En Render, revisá que `GEMINI_API_KEY` siga cargada. |
