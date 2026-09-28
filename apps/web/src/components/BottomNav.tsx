"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NexusOrb } from "./NexusOrb";

const LINKS = [
  { href: "/today", label: "Today", icon: "◎" },
  { href: "/calendar", label: "Calendar", icon: "▤" },
];
const RIGHT_LINKS = [
  { href: "/projects", label: "Projects", icon: "◧" },
  { href: "/more", label: "More", icon: "…" },
];

export function BottomNav({ onOrbClick }: { onOrbClick: () => void }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname?.startsWith(href);
  }

  return (
    <nav className="glass-panel fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-full px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:hidden">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-xs ${
            isActive(link.href) ? "text-nexus-cyan" : "text-nexus-muted"
          }`}
        >
          <span className="text-lg leading-none">{link.icon}</span>
          {link.label}
        </Link>
      ))}
      <div className="-mt-8">
        <NexusOrb size={56} onClick={onOrbClick} aria-label="Hablar con NEXUS" />
      </div>
      {RIGHT_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-xs ${
            isActive(link.href) ? "text-nexus-cyan" : "text-nexus-muted"
          }`}
        >
          <span className="text-lg leading-none">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
