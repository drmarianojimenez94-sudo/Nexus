"use client";
import { useRouter } from "next/navigation";
import type { Patient } from "@nexus/shared";
import { PatientForm } from "@/components/PatientForm";
import { ClinicalHeader, ClinicalNotice } from "@/components/ClinicalUi";
import { api } from "@/lib/api";
export default function NewPatientPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader title="Nuevo paciente" />
      <ClinicalNotice />
      <PatientForm
        onSave={async (input) => {
          const { patient } = await api.post<{ patient: Patient }>(
            "/clinical/patients",
            input,
          );
          router.replace(`/patients/${patient.id}`);
        }}
      />
    </div>
  );
}
