"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EncounterEditor } from "@/components/EncounterEditor";
export default function NewEncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { id } = use(params);
  const { draft } = use(searchParams);
  const router = useRouter();
  const valid =
    draft === "legacy" ||
    !!draft?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  useEffect(() => {
    if (!valid)
      router.replace(
        `/patients/${id}/consultations/new?draft=${crypto.randomUUID()}`,
      );
  }, [valid, id, router]);
  return valid ? (
    <EncounterEditor key={draft} patientId={id} draftId={draft} />
  ) : (
    <p>Preparando un borrador independiente…</p>
  );
}
