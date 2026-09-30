"use client";
import { use } from "react";
import { EncounterEditor } from "@/components/EncounterEditor";
export default function EncounterPage({
  params,
}: {
  params: Promise<{ id: string; encounterId: string }>;
}) {
  const { id, encounterId } = use(params);
  return <EncounterEditor patientId={id} encounterId={encounterId} />;
}
