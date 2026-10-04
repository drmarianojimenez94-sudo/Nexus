# Nexus — Fábrica de verticales y vertical médica

Nexus se organiza como un **núcleo genérico** más **verticales por profesión**. Una vertical es un manifiesto de datos validado (`packages/verticals`). El núcleo nunca pregunta "¿es medicina?": lee el manifiesto. Medicina es la primera vertical completa. Abogacía (`legal`) existe como borrador generado por la fábrica, para mostrar el camino.

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Contrato | `packages/verticals/src/manifest.ts` | Esquema Zod de una vertical: vocabulario, entidades mapeadas a un estándar, plantillas, flujos, marco legal, consentimiento, política de IA, salvaguardas, capacidades nativas, privacidad, tiendas, evaluación, captura, sugerencias y rutas. `defineVertical` valida además la coherencia (referencias, regex, plantillas). |
| Perfiles | `src/profiles.ts` | Lo que exige cada profesión y jurisdicción: `healthcare-ar` (Leyes 26.529, 25.326, 27.553, 27.706) y `generic`. Una profesión regulada nueva suma un perfil y no toca la rúbrica. |
| Rúbrica | `src/rubric.ts` | 100 puntos en 12 dimensiones. Compuerta: total ≥ mínimo del perfil y ≥ 70 % en las dimensiones críticas. Algunos puntos se **miden** (evidencia, umbral de casos), no solo se declaran. |
| Captura | `src/capture.ts`, `text.ts`, `safety.ts` | Pasa un dictado o texto a un **plan revisable**: ficha, borrador de consulta, seguimientos y turnos. Cada dato lleva el fragmento exacto que lo respalda. Es determinística y corre en el servidor de Nexus, sin IA externa. Incluye fechas en español rioplatense, señales de alarma con negación, fármacos (dosis, unidad y máximo por toma), cruce de alergias y diagnóstico marcado como presuntivo. |
| Plan | `src/plan.ts` | Pasos = llamadas a endpoints existentes, que ya validan y cifran. `executePlan` ejecuta solo lo confirmado, resuelve dependencias y reintenta de forma idempotente (`clientId`). `assignSubject` aplica la ficha elegida. |
| Mi día | `src/day.ts` | Turnos, vencidos, resultados, llamadas, borradores sin validar, huecos libres y sugerencias priorizadas, en la zona horaria de la vertical y con un resumen para leer en voz alta. |
| Evaluación | `src/evaluation.ts` | Corre los casos de referencia y clasifica errores (invención, omisión, negación, atribución, medicación, fecha, plantilla) en mayores y menores. |
| Nativo | `src/native.ts` | Genera plugins de Expo y permisos de Android desde las capacidades **implementadas**. Los textos de permiso de iOS son la `rationale` del manifiesto. |
| Fábrica | `src/scaffold.ts`, `src/cli.ts` | `new` crea una vertical en estado `draft`, `score` puntúa y `native` sincroniza `app.json`. |

### Integración

- API `apps/api/src/routes/verticals.ts`:
  - `GET /verticals`, `GET /verticals/:id` y `GET /verticals/:id/scorecard`.
  - `POST /verticals/:id/capture`: devuelve el plan y **no escribe nada**. La auditoría no guarda el texto. El modo `ambient` exige `consentConfirmed`.
  - `GET /verticals/:id/day`.
- Almacén de registros: personas, registros por plantilla (borrador → validado e inalterable) y pendientes, cifrados con AES-256-GCM. Hoy está montado en `/clinical/*` y es genérico. Las plantillas de otras verticales se aceptan como base con id `vertical:plantilla`.
- Privacidad del asistente general:
  - `POST /assistant/interpret` deriva los textos con datos de pacientes (`looksSensitive`) al asistente clínico, en lugar de enviarlos a Gemini/Claude o al inbox.
  - La web hace lo mismo sin IA configurada, sin conexión y desde Quick Capture.
- Web:
  - `/patients/capture`: modos escrito / dictado / conversación con consentimiento, evidencia por campo, alarmas, conflictos y confirmación paso a paso.
  - `/patients/day`.
  - Perfil profesional (especialidad y matrícula) en Ajustes.
  - Núcleo familiar en la ficha.
  - Folio en la historia.
- Nativo (`apps/mobile`):
  - Abre en **Mi día**, que se lee en voz alta.
  - El **Asistente** escucha al entrar, con dictado en el dispositivo cuando existe.
  - Selector de contactos y bloqueo con Face ID, huella o código.
  - Detalle en `apps/mobile/README.md`.

## Crear una vertical nueva

```bash
pnpm --filter @nexus/verticals new psicologia --name "Nexus Psicología" \
  --profession "Psicólogo/a" --subject "consultante/consultantes" --record "sesión/sesiones"
# registrar en packages/verticals/src/registry.ts
pnpm --filter @nexus/verticals score psicologia
```

La vertical nace en `draft`: no se expone en la API y la rúbrica dice qué falta. El orden recomendado:

1. Perfil de cumplimiento propio si la profesión está regulada.
2. Asientos legales (`legal.recordFields`).
3. Plantillas.
4. Señales de alarma del dominio.
5. Vocabulario (≥ 10 términos).
6. Casos de referencia.
7. Casos **ciegos**, escritos por alguien que no vio las reglas.

Recién con la compuerta aprobada pasa a `beta`.

## Puntaje actual

```
medicine (healthcare-ar): 99/100 — APROBADA (mínimo 90, compuerta OK)
  Ontología 12/12 · Registro legal 12/12 · Integridad 10/10 · Consentimiento 8/8
  IA y revisión humana 12/12 · Salvaguardas 10/10 · Flujos 8/8 · Nativo 8/8
  Privacidad 7/8 (falta borrado de cuenta desde la app) · Tiendas 4/4
  Evaluación 6/6 · Portabilidad 2/2
legal (generic): 84.9/100 — NO APROBADA (borrador: faltan procedencia, casos, vocabulario)
```

CI corre `pnpm --filter @nexus/verticals score` y falla si una vertical que no es borrador no aprueba.

## Qué mide y qué no mide el 99

La rúbrica comprueba que el manifiesto cubre lo exigido y que el código lo respeta. Pruebas que atan lo declarado a la implementación:

- Plantillas idénticas a las de la API.
- `app.json` sincronizado con el manifiesto.
- Dependencias nativas instaladas.
- Especialidad, núcleo familiar y folio en la API.
- Bloqueo de datos sensibles hacia la IA externa.
- Consentimiento exigido en modo conversación.

**No** mide la precisión real con dictados nunca vistos. Para eso se usaron cuatro rondas de casos escritos **a ciegas** por agentes que no leyeron el código:

| Ronda | Casos | Aprobados en primera pasada (ciego) |
|---|---|---|
| 1 | 30 | 14 (47 %) |
| 2 | 30 | 24 (80 %) |
| 3 | 40 | 26 (65 %) — 3 eran desacuerdos de etiquetado (turno ≠ control), reetiquetados |
| 4 | 40 | 31 (78 %) |

Después de cada ronda se corrigieron patrones generales, y ese set pasó a ser regresión: hoy pasan los 164 casos (24 propios y 140 ex ciegos).

**Precisión esperable con frases nuevas: alrededor de 75–80 %.** Las fallas típicas son frases coloquiales no previstas, fármacos fuera del catálogo (se marcan para verificar) y alarmas dichas con palabras nuevas.

Por eso todo pasa por revisión humana:

- Nada se guarda sin confirmar.
- El borrador conserva la transcripción y no se puede validar sin revisarla.
- Las alarmas son una ayuda, nunca un filtro.

Para subir de esa meseta hace falta un modelo de lenguaje con un proveedor que firme un acuerdo para datos de salud, o un modelo local. El punto de entrada ya existe: `ProposedField.source: "ai"`, que la política exige revisar.

## Pendientes conocidos (antes de usar con pacientes reales)

1. **Borrado de cuenta en la app** (App Store 5.1.1(v)) compatible con la custodia de historias por 10 años.
2. **Firma digital** (Ley 25.506): la validación de Nexus no lo es.
3. **Cámara y adjuntos** (`DocumentReference`): declarados como planificados, sin almacenamiento cifrado de archivos todavía.
4. **Notificaciones push y calendario del teléfono**: planificados.
5. **Prueba en dispositivos reales** del development build: verificados typecheck, lint, bundle iOS e Info.plist generado, pero no en un teléfono.
6. **Codificación CIE-10 estructurada**: hoy el diagnóstico es texto marcado como presuntivo.
7. **Revisión legal** de `docs/NEXUS_PRIVACY_POLICY.md` e inscripción de la base ante la AAIP.
8. `CLINICAL_DATA_KEY` obligatoria en producción. Hoy cae a `AUTH_SECRET`; rotar esa clave volvería ilegibles los datos.

## Secretario clínico (segunda etapa)

### Qué se agregó

**Entrada a la parte médica**
- La consola de voz de inicio tapaba la navegación y solo ofrecía Calendario, Hoy y Proyectos. Ahora muestra Pacientes, Dictar paciente y Mi día médico, y la barra inferior queda siempre visible.
- Por voz se entienden frases naturales: "abrí pacientes", "nuevo paciente", "dictar consulta", "mi día", "seguimientos", "correo".

**Consulta dictada** (plantilla `visit`)
- Secciones: motivo de consulta, enfermedad actual, examen, diagnóstico presuntivo, tratamiento y observaciones.
- Si el médico dicta el rótulo de una sección, todo lo que sigue va entero a ese campo. Sin rótulos, el intérprete deduce el motivo y la enfermedad actual del relato.

**Asistente clínico en vivo** (`POST /verticals/medicine/assist`)
- Recordatorios de guías, cada uno con su fuente (ADA, ESH, GOLD, GINA, KDIGO, SADI, SAP, MSAL). Funcionan sin IA.
- Prevención según edad y sexo.
- "Tu conducta habitual", tomada de lo que el médico valida.
- Sugerencias de IA (Gemini hoy; `AI_PROVIDER=anthropic` para Claude) sobre el caso **desidentificado**: sin nombre, DNI, teléfono, correo, fechas, direcciones ni otros nombres propios.
- La pantalla muestra exactamente qué se envió.

**Cerebro**
- Cada consulta validada enseña "cuadro → conducta" (`clinical_habits`).
- Se ve y se borra desde Memoria ("Lo que Nexus aprendió de vos").
- Nunca guarda la identidad del paciente.

**Secretario**
- "Mandale un mail a…": redacta y deja el borrador en Gmail; solo se envía con tu confirmación.
- "Poneme una alarma…": en Android abre el Reloj; en iPhone programa un aviso con sonido. Además queda como recordatorio en Nexus.
- "Agendá…": crea el turno en Nexus, en Google Calendar (si se dio permiso de escritura) y en el calendario del teléfono.

**Voz**
- Nexus responde hablando ("Abriendo calendario"). Usa la voz más natural en español del dispositivo y se puede silenciar.
- La voz neural queda lista: `VOICE_PROVIDER=google|elevenlabs|openai`, `VOICE_API_KEY` y `VOICE_NAME` opcional.

**App nativa**
- Pestañas: Inicio (secretario que escucha), Pacientes, Dictar, Mi día y Agenda.
- Calendario y notificaciones del teléfono, alarmas, contactos y bloqueo biométrico.
- Resumen diario de Mi día sin nombres de pacientes.

### Simulación de consultorio (30 pacientes, 35 consultas por lote)

`apps/api/src/tests/clinicSimulation.test.ts` recorre la API real como un médico: crea la ficha, dicta, confirma, pide sugerencias, valida y aprende. Los lotes los escribieron agentes que no vieron el código.

| Métrica | Lote 1: ciego, 1.ª pasada | Lote 1: tras corregir | Lote 2: ciego, 1.ª pasada | Lote 2: tras corregir |
|---|---|---|---|---|
| Guardadas y validadas | 35/35 | 35/35 | 35/35 | 35/35 |
| Motivo de consulta | 83 % | 100 % | 51 % | 97 % |
| Enfermedad actual | 80 % | 97 % | 97 % | 97 % |
| Tratamiento | 94 % | 100 % | 79 % | 97 % |
| Observaciones | 81 % | 100 % | 79 % | 79 % |
| Recordatorios de guías | 94 % | 98 % | 90 % | 98 % |
| Señales de alarma | 100 % | 100 % | 100 % | 100 % |
| Seguimientos | 74 % | 100 % | 84 % | 96 % |
| Identidad enviada a la IA | 0 | 0 | 0 | 0 |

**Las columnas de primera pasada son la medida honesta** de cómo le va con dictados nuevos. Las correcciones fueron siempre generales:

- rótulos dictados;
- "la traen por…";
- "se solicita…";
- "la veo en…";
- muletillas como "eh", "bueno", "a ver".

Las fallas que quedan son, sobre todo, desacuerdos de criterio: qué parte de un relato sin rótulos es "observación".

Con IA configurada, las sugerencias son propuestas para el médico, marcadas "verificar". Su calidad clínica depende del modelo (Gemini gratis hoy) y no se midió en este entorno porque no hay una clave de IA disponible.

### Pendiente para la próxima etapa

- Probar la app nativa en un iPhone y un Android reales (development build con EAS).
- Configurar en Render: `GEMINI_API_KEY` (o Claude), Google OAuth (Gmail y Calendar con permiso de escritura) y, cuando quieras, la voz neural.
- Un set de casos para evaluar la calidad de las sugerencias de IA, cuando haya clave configurada.
