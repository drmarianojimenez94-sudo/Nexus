"use client";
import { use } from "react";
import { EncounterEditor } from "@/components/EncounterEditor";
export default function NewEncounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EncounterEditor patientId={id} />;
}
