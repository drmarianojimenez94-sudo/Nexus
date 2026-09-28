"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NexusOrb } from "@/components/NexusOrb";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/today");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-3">
        <NexusOrb size={56} />
        <h1 className="text-xl font-semibold">Bienvenido a NEXUS</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-nexus-border bg-black/30 px-3 py-2 text-nexus-text placeholder:text-nexus-muted focus:border-nexus-cyan focus:outline-none"
        />
        <input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-nexus-border bg-black/30 px-3 py-2 text-nexus-text placeholder:text-nexus-muted focus:border-nexus-cyan focus:outline-none"
        />
        {error && <p className="text-sm text-nexus-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-xl bg-nexus-cyan py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-nexus-muted">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="text-nexus-cyan">
          Creá una
        </Link>
      </p>
    </div>
  );
}
