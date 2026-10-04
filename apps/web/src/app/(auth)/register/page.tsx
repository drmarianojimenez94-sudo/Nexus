"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NexusCore } from "@/components/NexusCore";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type FieldErrors = { name?: string; email?: string; password?: string };

function validate(name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = "Ingresá tu nombre.";
  if (!email.trim()) errors.email = "Ingresá tu email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Ingresá un email válido.";
  if (!password) errors.password = "Ingresá una contraseña.";
  else if (password.length < 8) errors.password = "La contraseña debe tener al menos 8 caracteres.";
  return errors;
}

const inputClass =
  "w-full rounded-xl border bg-black/30 px-3 py-2 text-nexus-text placeholder:text-nexus-muted focus:border-nexus-cyan focus:outline-none";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(name, email, password);
    setFieldErrors(errors);
    if (errors.name || errors.email || errors.password) {
      setError(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace("/today");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-3">
        <NexusCore size={84} />
        <h1 className="text-xl font-semibold">Soy NEXUS</h1>
        <p className="text-center text-sm text-nexus-muted">
          Puedo ayudarte a organizar tareas, proyectos, agenda y otras áreas de tu vida.
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <input
            id="register-name"
            placeholder="Nombre"
            aria-label="Nombre"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            className={`${inputClass} ${fieldErrors.name ? "border-nexus-danger" : "border-nexus-border"}`}
          />
          {fieldErrors.name && (
            <p id="register-name-error" role="alert" className="text-sm text-nexus-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            id="register-email"
            type="email"
            placeholder="Email"
            aria-label="Email"
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            className={`${inputClass} ${fieldErrors.email ? "border-nexus-danger" : "border-nexus-border"}`}
          />
          {fieldErrors.email && (
            <p id="register-email-error" role="alert" className="text-sm text-nexus-danger">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            id="register-password"
            type="password"
            placeholder="Contraseña (mín. 8 caracteres)"
            aria-label="Contraseña"
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            className={`${inputClass} ${fieldErrors.password ? "border-nexus-danger" : "border-nexus-border"}`}
          />
          {fieldErrors.password && (
            <p id="register-password-error" role="alert" className="text-sm text-nexus-danger">
              {fieldErrors.password}
            </p>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-nexus-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 min-h-11 rounded-xl bg-nexus-cyan py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          {submitting ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-nexus-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-nexus-cyan">
          Ingresá
        </Link>
      </p>
    </div>
  );
}
