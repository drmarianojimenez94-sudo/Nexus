"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { Patient } from "@nexus/shared";
import { PatientForm } from "@/components/PatientForm";
import { ClinicalHeader, ClinicalNotice } from "@/components/ClinicalUi";
import { api } from "@/lib/api";
export default function NewPatientPage() {
  const router = useRouter();
  const clientId = useRef("");
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader title="Nuevo paciente" />
      <ClinicalNotice />
      <PatientForm
        onSave={async (input) => {
          const { patient } = await api.post<{ patient: Patient }>(
            "/clinical/patients",
            { ...input, clientId: (clientId.current ||= crypto.randomUUID()) },
          );
          router.replace(`/patients/${patient.id}`);
        }}
      />
    </div>
  );
}
