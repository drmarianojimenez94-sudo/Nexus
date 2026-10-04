"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NexusCore } from "./NexusCore";
import { UiIcon, type IconName } from "./UiIcon";
const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/today", label: "Hoy", icon: "today" },
  { href: "/inbox", label: "Bandeja", icon: "inbox" },
  { href: "/calendar", label: "Calendario", icon: "calendar" },
  { href: "/patients", label: "Pacientes", icon: "patients" },
  { href: "/projects", label: "Proyectos", icon: "projects" },
  { href: "/areas", label: "Áreas", icon: "areas" },
  { href: "/brain", label: "Lo que aprendí", icon: "memory" },
  { href: "/memory", label: "Memoria", icon: "memory" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
];
export function Sidebar({ onOrbClick }: { onOrbClick: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  return (
    <aside className="glass-panel nexus-sidebar sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-56 shrink-0 flex-col justify-between p-4 sm:flex">
      <div>
        <button
          onClick={onOrbClick}
          className="mb-8 flex w-full items-center gap-3 text-left"
          aria-label="Hablar con Nexus"
        >
          <NexusCore size={44} />
          <span>
            <span className="block text-lg font-semibold tracking-[0.2em]">
              NEXUS
            </span>
            <span className="hud-label text-nexus-muted">
              Asistente personal
            </span>
          </span>
        </button>
        <p className="hud-label mb-3 px-3 text-nexus-muted">
          Centro de control
        </p>
        <nav className="flex flex-col gap-1.5" aria-label="Secciones de Nexus">
          {LINKS.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`nexus-nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "nexus-nav-active text-nexus-cyan" : "text-nexus-muted hover:text-nexus-text"}`}
              >
                <UiIcon name={link.icon} />
                {link.label}
                {active && (
                  <span className="ml-auto h-1 w-1 rounded-full bg-nexus-cyan" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-nexus-border pt-4">
        <button
          onClick={onOrbClick}
          className="nexus-voice-launch mb-5 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-nexus-cyan"
        >
          <UiIcon name="voice" />
          Hablar con Nexus
        </button>
        <p className="truncate text-sm">{user?.name}</p>
        <p className="mt-1 truncate text-xs text-nexus-muted">{user?.email}</p>
        <button
          onClick={() => void logout()}
          className="mt-3 text-xs text-nexus-muted hover:text-nexus-text"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
