import { BluetoothPanel } from "@/components/BluetoothPanel";
import { GoogleWorkspacePanel } from "@/components/GoogleWorkspacePanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { VoicePreferences } from "@/components/VoicePreferences";
import { VoiceOutputPreferences } from "@/components/VoiceOutputPreferences";
import { ThemePreferences } from "@/components/ThemePreferences";
import { ClinicalProfilePreferences } from "@/components/ClinicalProfilePreferences";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Ajustes</h1>
      </header>
      <VoicePreferences />
      <VoiceOutputPreferences />
      <ThemePreferences />
      <ClinicalProfilePreferences />
      <IntegrationsPanel />
      <GoogleWorkspacePanel />
      <BluetoothPanel />
    </div>
  );
}
