"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

const LINKS = [
  { href: "/projects", label: "Proyectos" },
  { href: "/patients", label: "Pacientes" },
  { href: "/inbox", label: "Bandeja" },
  { href: "/areas", label: "Áreas" },
  { href: "/brain", label: "🧠 Lo que aprendí de vos" },
  { href: "/memory", label: "Memoria" },
  { href: "/settings", label: "Ajustes" },
];

export default function MorePage() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Más</h1>
        <p className="text-sm text-nexus-muted">{user?.email}</p>
      </header>
      <nav className="glass-panel flex flex-col divide-y divide-nexus-border">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="p-4 text-sm">
            {link.label}
          </Link>
        ))}
        <button
          onClick={() => void logout()}
          className="p-4 text-left text-sm text-nexus-danger"
        >
          Cerrar sesión
        </button>
      </nav>
    </div>
  );
}
