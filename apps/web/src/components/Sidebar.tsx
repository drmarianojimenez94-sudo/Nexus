"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NexusOrb } from "./NexusOrb";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/calendar", label: "Calendar" },
  { href: "/projects", label: "Projects" },
  { href: "/areas", label: "Areas" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({ onOrbClick }: { onOrbClick: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="glass-panel sticky top-4 hidden h-[calc(100vh-2rem)] w-60 flex-col justify-between p-4 sm:flex">
      <div>
        <div className="mb-6 flex items-center gap-3 px-1">
          <NexusOrb size={40} onClick={onOrbClick} />
          <span className="text-lg font-semibold tracking-wide">NEXUS</span>
        </div>
        <nav className="flex flex-col gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname?.startsWith(link.href)
                  ? "bg-white/5 text-nexus-cyan"
                  : "text-nexus-muted hover:bg-white/5 hover:text-nexus-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="px-1">
        <p className="mb-2 truncate text-xs text-nexus-muted">{user?.email}</p>
        <button
          onClick={() => void logout()}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-nexus-muted hover:bg-white/5 hover:text-nexus-text"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
