"use client";
import { use } from "react";
import { EncounterEditor } from "@/components/EncounterEditor";
export default function EncounterPage({
  params,
}: {
  params: Promise<{ id: string; encounterId: string }>;
}) {
  const { id, encounterId } = use(params);
  return (
    <EncounterEditor
      key={`${id}:${encounterId}`}
      patientId={id}
      encounterId={encounterId}
    />
  );
}
