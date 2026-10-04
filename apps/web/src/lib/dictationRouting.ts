import { looksSensitive, medicineVertical } from "@nexus/verticals";

const UUID = /\/patients\/([0-9a-f-]{36})(?:\/|$)/i;

/** ¿Lo dictado es clínico? En una ficha o pantalla de pacientes, siempre. */
export function isClinicalDictation(text: string, path: string): boolean {
  return path.startsWith("/patients") || looksSensitive(text, medicineVertical);
}

/** Pantalla de dictado clínico con el texto, lista para armar la ficha. */
export function clinicalCaptureUrl(path: string): string {
  const patient = UUID.exec(path)?.[1];
  return `/patients/capture?auto=1${patient ? `&patient=${patient}` : ""}`;
}
