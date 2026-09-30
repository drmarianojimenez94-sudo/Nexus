import { ClinicalHeader } from "@/components/ClinicalUi";
import { ClinicalFollowups } from "@/components/ClinicalFollowups";
export default function FollowupsPage() {
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Seguimientos"
        detail="Controles, llamadas y estudios pendientes de revisión."
      />
      <ClinicalFollowups />
    </div>
  );
}
