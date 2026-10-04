import { fold } from "./text";

export interface GuidelineCondition {
  id: string;
  label: string;
  /** Regex sobre texto normalizado (minúsculas, sin tildes). */
  patterns: string[];
  /** Qué controlar o recordar en el seguimiento. */
  checks: string[];
  /** Abordaje general sugerido (no reemplaza el criterio del profesional). */
  approach: string[];
  sources: string[];
}

export interface GuidelineMatch {
  id: string;
  label: string;
  checks: string[];
  approach: string[];
  sources: string[];
}

/**
 * Recordatorios basados en guías de práctica clínica de uso habitual en
 * Argentina. Son ayuda-memoria para el profesional: no son indicaciones,
 * no se aplican solos y deben verificarse con la guía vigente.
 */
export const CLINICAL_GUIDELINES: GuidelineCondition[] = [
  {
    id: "hypertension",
    label: "Hipertensión arterial",
    patterns: ["\\bhta\\b", "hipertens", "presion alta"],
    checks: [
      "Confirmar con mediciones fuera del consultorio (MAPA o automedición) si es diagnóstico nuevo.",
      "Laboratorio basal: creatinina con filtrado glomerular, ionograma, glucemia, perfil lipídico, orina completa con relación albúmina/creatinina.",
      "ECG basal y evaluación de daño de órgano blanco.",
      "Objetivo general < 130/80 mmHg si se tolera; controlar adherencia y efectos adversos.",
    ],
    approach: ["Cambios de estilo de vida: sodio < 5 g/día, actividad física, peso, alcohol.", "Iniciar o ajustar tratamiento según riesgo cardiovascular; preferir combinaciones en un comprimido cuando corresponda."],
    sources: ["ESH 2023", "Consenso Argentino de HTA (SAC/FAC/SAHA)"],
  },
  {
    id: "diabetes2",
    label: "Diabetes tipo 2",
    patterns: ["\\bdbt\\b", "\\bdm2?\\b", "diabet", "\\bhba1c\\b", "hemoglobina glicosilada"],
    checks: [
      "HbA1c cada 3 meses si no está en objetivo; cada 6 si está estable (objetivo individualizado, en general < 7 %).",
      "Fondo de ojo anual.",
      "Relación albúmina/creatinina en orina y filtrado glomerular anual.",
      "Examen de pies en cada control (monofilamento anual).",
      "Perfil lipídico anual y evaluar estatina.",
      "Vacunas: antigripal anual, antineumocócica, hepatitis B según edad.",
    ],
    approach: ["Metformina como base salvo contraindicación.", "Si hay enfermedad cardiovascular, insuficiencia cardíaca o renal: considerar iSGLT2 o arGLP-1 con beneficio demostrado."],
    sources: ["ADA Standards of Care 2026", "Sociedad Argentina de Diabetes"],
  },
  {
    id: "dyslipidemia",
    label: "Dislipemia",
    patterns: ["dislipem", "colesterol", "\\bldl\\b", "triglicerid", "hipercolesterol"],
    checks: ["Calcular riesgo cardiovascular global.", "Perfil lipídico a las 6–12 semanas de iniciar o ajustar estatina y luego anual.", "Hepatograma basal; CPK si hay síntomas musculares."],
    approach: ["Objetivo de LDL según riesgo (muy alto riesgo < 55 mg/dL).", "Estatina de intensidad acorde al riesgo; agregar ezetimibe si no alcanza el objetivo."],
    sources: ["ESC/EAS 2019 (actualización 2025)"],
  },
  {
    id: "hypothyroidism",
    label: "Hipotiroidismo",
    patterns: ["hipotiroid", "levotiroxina", "\\btsh\\b"],
    checks: ["TSH 6–8 semanas después de cada cambio de dosis; luego anual si está estable.", "Tomar levotiroxina en ayunas, separada de calcio, hierro e inhibidores de la bomba de protones."],
    approach: ["Ajustar dosis según TSH y clínica; en adultos mayores o cardiópatas empezar con dosis bajas."],
    sources: ["ATA / Sociedad Argentina de Endocrinología"],
  },
  {
    id: "copd",
    label: "EPOC",
    patterns: ["\\bepoc\\b", "enfermedad pulmonar obstructiva"],
    checks: ["Espirometría para confirmar y seguimiento anual.", "Revisar técnica inhalatoria y adherencia en cada control.", "Vacunas: antigripal, antineumocócica, COVID, VSR según edad.", "Cesación tabáquica en cada visita."],
    approach: ["Broncodilatador de acción prolongada (LAMA/LABA) según síntomas y exacerbaciones.", "Rehabilitación respiratoria si hay disnea limitante."],
    sources: ["GOLD 2026"],
  },
  {
    id: "asthma",
    label: "Asma",
    patterns: ["\\basma\\b", "asmatic", "broncoespasmo"],
    checks: ["Evaluar control de síntomas y uso de rescate.", "Revisar técnica inhalatoria y plan de acción escrito.", "Espirometría con prueba broncodilatadora para confirmar."],
    approach: ["Evitar el salbutamol solo como tratamiento único: preferir esquemas con corticoide inhalado (por ejemplo budesonida-formoterol a demanda)."],
    sources: ["GINA 2026"],
  },
  {
    id: "heart_failure",
    label: "Insuficiencia cardíaca",
    patterns: ["insuficiencia cardiaca", "\\bic\\b", "\\bicc\\b", "fraccion de eyeccion"],
    checks: ["Peso diario y signos de congestión.", "Función renal y potasio tras iniciar o ajustar IECA/ARA2/ARNI, antialdosterónicos o iSGLT2.", "Ecocardiograma para clasificar por fracción de eyección."],
    approach: ["Con FE reducida: cuatro pilares (ARNI/IECA, betabloqueante, antialdosterónico, iSGLT2) titulados.", "Diuréticos según congestión."],
    sources: ["ESC 2021 (actualización 2023)", "Consenso SAC"],
  },
  {
    id: "atrial_fibrillation",
    label: "Fibrilación auricular",
    patterns: ["fibrilacion auricular", "\\bfa\\b", "aleteo"],
    checks: ["Calcular CHA₂DS₂-VA para decidir anticoagulación.", "Función renal para ajustar anticoagulantes directos.", "Control de frecuencia o ritmo según síntomas."],
    approach: ["Anticoagulación oral si el riesgo lo indica; preferir anticoagulantes directos sobre warfarina salvo excepciones."],
    sources: ["ESC 2024"],
  },
  {
    id: "coronary",
    label: "Cardiopatía isquémica",
    patterns: ["angina", "infarto", "\\biam\\b", "coronari", "stent", "angioplast"],
    checks: ["LDL en objetivo (< 55 mg/dL).", "Antiagregación y su duración tras stent.", "Rehabilitación cardiovascular."],
    approach: ["Estatina de alta intensidad, antiagregante, betabloqueante si corresponde, control estricto de factores de riesgo."],
    sources: ["ESC 2024 (síndromes coronarios crónicos)"],
  },
  {
    id: "ckd",
    label: "Enfermedad renal crónica",
    patterns: ["insuficiencia renal", "\\berc\\b", "enfermedad renal", "creatinina elevada"],
    checks: ["Filtrado glomerular y albuminuria para estadificar (KDIGO).", "Ajustar dosis de fármacos por función renal.", "Evitar AINES y nefrotóxicos."],
    approach: ["IECA/ARA2 si hay albuminuria; considerar iSGLT2."],
    sources: ["KDIGO 2024"],
  },
  {
    id: "obesity",
    label: "Obesidad",
    patterns: ["obesidad", "sobrepeso", "\\bimc\\b"],
    checks: ["Registrar IMC y circunferencia de cintura.", "Detectar comorbilidades: glucemia, perfil lipídico, TA, hígado graso, apnea del sueño."],
    approach: ["Plan nutricional y actividad física; considerar farmacoterapia (arGLP-1) o cirugía bariátrica según IMC y comorbilidades."],
    sources: ["Guía de práctica clínica nacional de obesidad (MSAL)"],
  },
  {
    id: "smoking",
    label: "Tabaquismo",
    patterns: ["tabaquis", "fumador", "fuma\\b", "cigarrillos"],
    checks: ["Consejo breve de cesación en cada consulta (5 A).", "Rastreo de cáncer de pulmón con TC de baja dosis si cumple criterios de edad y carga tabáquica."],
    approach: ["Ofrecer tratamiento farmacológico (terapia de reemplazo nicotínico, vareniclina o bupropión) más apoyo conductual."],
    sources: ["Guía nacional de tratamiento de la adicción al tabaco (MSAL)", "USPSTF 2021"],
  },
  {
    id: "depression",
    label: "Depresión",
    patterns: ["depresi", "animo bajo", "anhedonia"],
    checks: ["Evaluar riesgo suicida en cada consulta.", "PHQ-9 para seguimiento.", "Reevaluar a las 4–6 semanas de iniciar antidepresivo."],
    approach: ["Psicoterapia y/o ISRS; derivar a salud mental si es grave, hay riesgo o no responde."],
    sources: ["NICE NG222", "Ley de Salud Mental 26.657"],
  },
  {
    id: "anxiety",
    label: "Ansiedad",
    patterns: ["ansiedad", "ataque de panico", "angustia"],
    checks: ["GAD-7 para seguimiento.", "Evitar el uso prolongado de benzodiacepinas."],
    approach: ["Psicoterapia (TCC); ISRS o IRSN si corresponde."],
    sources: ["NICE CG113"],
  },
  {
    id: "pregnancy",
    label: "Control prenatal",
    patterns: ["embaraz", "gestacion", "semanas de gestacion", "prenatal"],
    checks: [
      "Ácido fólico y laboratorio del trimestre (grupo y factor, VDRL, HIV, hepatitis B, Chagas, toxoplasmosis, glucemia).",
      "PTOG 75 g entre las semanas 24 y 28.",
      "Vacunas: dTpa desde la semana 20, antigripal y VSR según la edad gestacional.",
      "Medir TA en cada control (preeclampsia).",
    ],
    approach: ["Revisar la seguridad en el embarazo de cada fármaco antes de indicarlo."],
    sources: ["Guía para la atención del embarazo (MSAL)"],
  },
  {
    id: "well_child",
    label: "Control de niño sano",
    patterns: ["nino sano", "control pediatrico", "\\bnene\\b", "\\bnena\\b", "lactante"],
    checks: ["Peso, talla y perímetro cefálico en percentilos.", "Calendario nacional de vacunación al día.", "Pautas de desarrollo y pesquisa visual y auditiva según edad."],
    approach: ["Anticipar pautas de alimentación, sueño seguro y prevención de accidentes."],
    sources: ["Guía para la supervisión de la salud de niños (SAP)", "Calendario Nacional de Vacunación"],
  },
  {
    id: "uti",
    label: "Infección urinaria",
    patterns: ["infeccion urinaria", "\\bitu\\b", "disuria", "cistitis", "urocultivo"],
    checks: ["Urocultivo si es complicada, recurrente, en embarazo o en varones.", "Descartar pielonefritis (fiebre, dolor lumbar)."],
    approach: ["Cistitis no complicada en mujeres: nitrofurantoína o fosfomicina según resistencia local."],
    sources: ["SADI — Consenso de infecciones urinarias"],
  },
  {
    id: "pharyngitis",
    label: "Faringitis",
    patterns: ["faringitis", "odinofagia", "anginas", "amigdalitis"],
    checks: ["Score de Centor/McIsaac y test rápido o cultivo para estreptococo.", "Antibiótico solo si se confirma estreptococo."],
    approach: ["Estreptocócica: amoxicilina o penicilina; si hay alergia, macrólido según el tipo de alergia."],
    sources: ["SADI / SAP — Consenso de faringitis"],
  },
  {
    id: "pneumonia",
    label: "Neumonía de la comunidad",
    patterns: ["neumonia", "\\bnac\\b", "consolidacion"],
    checks: ["CURB-65 o CRB-65 para decidir internación.", "Saturación de oxígeno.", "Control clínico a las 48–72 h."],
    approach: ["Ambulatorio sin comorbilidades: amoxicilina; con comorbilidades: amoxicilina-clavulánico ± macrólido según la guía local."],
    sources: ["SADI — Neumonía adquirida en la comunidad"],
  },
  {
    id: "low_back_pain",
    label: "Lumbalgia",
    patterns: ["lumbalgia", "dolor lumbar", "lumbociatalgia", "ciatalgia"],
    checks: ["Buscar banderas rojas: fiebre, pérdida de peso, cáncer previo, déficit neurológico, incontinencia, trauma.", "Imágenes solo si hay banderas rojas o no mejora en 4–6 semanas."],
    approach: ["Mantener la actividad, analgesia (AINES el menor tiempo posible), kinesiología."],
    sources: ["NICE NG59"],
  },
  {
    id: "headache",
    label: "Cefalea",
    patterns: ["cefalea", "migrana", "jaqueca", "dolor de cabeza"],
    checks: ["Signos de alarma SNOOP4 (súbita, progresiva, focalidad, fiebre, mayores de 50 años).", "Evitar el abuso de analgésicos (más de 10–15 días al mes)."],
    approach: ["Migraña: AINES o triptanes en la crisis; profilaxis si las crisis son frecuentes."],
    sources: ["Sociedad Neurológica Argentina", "NICE CG150"],
  },
  {
    id: "osteoporosis",
    label: "Osteoporosis",
    patterns: ["osteoporosis", "osteopenia", "densitometria", "fractura de cadera"],
    checks: ["Densitometría en mujeres de 65 años o más (antes si hay factores de riesgo).", "Vitamina D y calcio.", "Riesgo de caídas."],
    approach: ["Bifosfonatos como primera línea según FRAX y densitometría."],
    sources: ["Sociedad Argentina de Osteoporosis"],
  },
  {
    id: "gout",
    label: "Gota",
    patterns: ["\\bgota\\b", "hiperuricemia", "acido urico"],
    checks: ["Uricemia: objetivo < 6 mg/dL en tratamiento hipouricemiante.", "Función renal."],
    approach: ["Crisis: colchicina, AINES o corticoides; alopurinol en dosis creciente para la prevención."],
    sources: ["EULAR 2016 / ACR 2020"],
  },
  {
    id: "anemia",
    label: "Anemia ferropénica",
    patterns: ["anemia", "ferropen", "ferritina baja"],
    checks: ["Buscar la causa (sangrado digestivo o ginecológico).", "Hemograma y ferritina a las 4–8 semanas de iniciar hierro."],
    approach: ["Hierro oral en días alternos mejora la absorción y la tolerancia."],
    sources: ["BSG 2021", "Sociedad Argentina de Hematología"],
  },
  {
    id: "older_adult",
    label: "Adulto mayor",
    patterns: ["adulto mayor", "anciano", "\\b(?:7\\d|8\\d|9\\d) anos\\b", "deterioro cognitivo", "caidas"],
    checks: ["Revisar polifarmacia con criterios de Beers o STOPP/START.", "Riesgo de caídas, cognición, funcionalidad y vacunas."],
    approach: ["Desprescribir lo que no aporte beneficio; metas individualizadas."],
    sources: ["AGS Beers 2023", "STOPP/START v3"],
  },
];

/** Prevención por edad y sexo (rastreo), independiente del motivo. */
export function preventiveReminders(age: number | null, sex: string | undefined): string[] {
  if (age === null) return [];
  const out: string[] = [];
  if (age >= 18) out.push("TA al menos cada 1–2 años.");
  if (age >= 35 && age <= 70) out.push("Glucemia o HbA1c si hay sobrepeso u otro factor de riesgo (USPSTF).");
  if (age >= 45 && age <= 75) out.push("Rastreo de cáncer colorrectal (SOMF/test inmunoquímico anual o VCC cada 10 años) (MSAL).");
  if (sex === "F" && age >= 25 && age <= 64) out.push("PAP/test de VPH según el esquema del programa nacional.");
  if (sex === "F" && age >= 50 && age <= 69) out.push("Mamografía cada 1–2 años (MSAL).");
  if (sex === "F" && age >= 65) out.push("Densitometría ósea.");
  if (age >= 65) out.push("Vacunas: antigripal anual, antineumocócica, dT cada 10 años.");
  if (age >= 40) out.push("Riesgo cardiovascular global (perfil lipídico).");
  return out;
}

export function matchGuidelines(text: string): GuidelineMatch[] {
  const folded = fold(text);
  return CLINICAL_GUIDELINES.filter((g) => g.patterns.some((p) => new RegExp(p).test(folded))).map(({ id, label, checks, approach, sources }) => ({
    id,
    label,
    checks,
    approach,
    sources,
  }));
}
