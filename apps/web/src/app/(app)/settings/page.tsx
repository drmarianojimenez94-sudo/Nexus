import { BluetoothPanel } from "@/components/BluetoothPanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { VoicePreferences } from "@/components/VoicePreferences";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>
      <VoicePreferences />
      <IntegrationsPanel />
      <BluetoothPanel />
    </div>
  );
}
