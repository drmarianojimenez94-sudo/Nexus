import type { VerticalManifest } from "./manifest";
import type { VerticalAdapter } from "./plan";
import { recordStoreAdapter } from "./recordStore";
import { medicineVertical } from "./verticals/medicine/manifest";
import { legalVertical } from "./verticals/legal/manifest";

export interface RegisteredVertical {
  manifest: VerticalManifest;
  adapter: VerticalAdapter;
}

/**
 * Verticales disponibles. Una vertical nueva se genera con
 * `pnpm --filter @nexus/verticals new <id>` y se agrega acá.
 */
export const VERTICALS: Record<string, RegisteredVertical> = {
  [medicineVertical.id]: { manifest: medicineVertical, adapter: recordStoreAdapter },
  [legalVertical.id]: { manifest: legalVertical, adapter: recordStoreAdapter },
};

export function getVertical(id: string): RegisteredVertical | undefined {
  return VERTICALS[id];
}

/**
 * Plantillas de verticales distintas de medicina, expuestas como plantillas
 * base con id `vertical:plantilla` para el almacén de registros.
 */
export function verticalTemplate(id: string): { id: string; name: string; description: string; version: number; fields: { key: string; label: string }[] } | undefined {
  const [verticalId, templateId] = id.split(":");
  if (!verticalId || !templateId) return undefined;
  const t = VERTICALS[verticalId]?.manifest.templates.find((x) => x.id === id);
  if (!t) return undefined;
  return { id: t.id, name: t.name, description: t.structure, version: 1, fields: t.sections.map((s) => ({ key: s.key, label: s.label })) };
}
