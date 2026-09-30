"use client";
import Link from "next/link";
export const clinicalInput =
  "w-full min-w-0 rounded-xl border border-nexus-border bg-black/20 p-3 text-sm focus:border-nexus-cyan";
export const clinicalButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg disabled:opacity-40";
export const clinicalSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-nexus-border px-4 py-2 text-sm disabled:opacity-40";
export function ClinicalHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <header className="glass-panel p-5">
      <p className="hud-label mb-2 text-nexus-cyan">Nexus · Pacientes</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {detail && <p className="mt-2 text-sm text-nexus-muted">{detail}</p>}
      <nav className="mt-4 flex flex-wrap gap-4 text-sm text-nexus-cyan">
        <Link href="/patients">Pacientes</Link>
        <Link href="/patients/followups">Seguimientos</Link>
        <Link href="/patients/templates">Plantillas</Link>
      </nav>
    </header>
  );
}
export function ClinicalNotice() {
  return (
    <p className="rounded-xl border border-nexus-border p-3 text-xs leading-relaxed text-nexus-muted">
      Espacio clínico separado de la memoria personal. Los campos vacíos
      permanecen sin registrar. El asistente general no procesa estas fichas.
    </p>
  );
}
export function ClinicalError({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-xl border border-nexus-danger/40 p-3 text-sm text-nexus-danger"
    >
      {message}
    </p>
  ) : null;
}
export function downloadText(
  name: string,
  text: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
