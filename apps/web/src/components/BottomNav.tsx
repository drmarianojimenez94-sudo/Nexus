"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NexusCore } from "./NexusCore";
import { UiIcon, type IconName } from "./UiIcon";
const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/today", label: "Hoy", icon: "today" },
  { href: "/calendar", label: "Agenda", icon: "calendar" },
  { href: "/patients", label: "Pacientes", icon: "patients" },
  { href: "/more", label: "Más", icon: "more" },
];
export function BottomNav({ onOrbClick }: { onOrbClick: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="glass-panel nexus-bottom-nav fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 items-center px-1 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:hidden"
    >
      {LINKS.map((link, index) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname?.startsWith(link.href) ? "page" : undefined}
          style={{ gridColumn: index < 2 ? index + 1 : index + 2, gridRow: 1 }}
          className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${pathname?.startsWith(link.href) ? "text-nexus-cyan" : "text-nexus-muted"}`}
        >
          <UiIcon name={link.icon} />
          {link.label}
        </Link>
      ))}
      <button
        onClick={onOrbClick}
        aria-label="Hablar con Nexus"
        className="col-start-3 row-start-1 mx-auto -mt-6 rounded-full border border-nexus-cyan/30 bg-nexus-bg p-1 shadow-glow"
      >
        <NexusCore size={48} />
      </button>
    </nav>
  );
}
