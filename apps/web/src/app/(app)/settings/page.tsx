import { BluetoothPanel } from "@/components/BluetoothPanel";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>
      <section className="glass-panel p-4">
        <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">INTEGRATIONS</h2>
        <p className="text-sm text-nexus-muted">
          Google Calendar, Gmail, Contacts y Drive se conectan acá a partir de la Fase 4 (Nexus Connect).
        </p>
      </section>
      <BluetoothPanel />
    </div>
  );
}
