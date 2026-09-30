"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { queueCapture } from "@/lib/offlineQueue";
import { useAuth } from "@/lib/auth-context";

interface QuickCaptureModalProps {
  onClose: () => void;
  onCaptured?: () => void;
}

/**
 * Always-reachable capture (spec §11): dump a thought without classifying
 * it. Voice capture is stubbed until Nexus Voice (Phase 2) lands; text
 * works end to end today, online or offline (spec §51).
 */
export function QuickCaptureModal({
  onClose,
  onCaptured,
}: QuickCaptureModalProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rawText = text.trim();
    if (!rawText) return;
    setSubmitting(true);
    setError(null);

    if (!navigator.onLine) {
      if (!queueCapture(rawText, "TEXT", user?.id)) {
        setError("No se pudo guardar en el dispositivo. El texto sigue aquí.");
        setSubmitting(false);
        return;
      }
      setText("");
      setQueuedNotice(true);
      setSubmitting(false);
      setTimeout(() => {
        onCaptured?.();
        onClose();
      }, 900);
      return;
    }

    try {
      await api.post("/quick-capture", { rawText, source: "TEXT" });
      setText("");
      onCaptured?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError("No se pudo guardar. Probá de nuevo.");
      } else {
        // Network failure even though navigator.onLine said we're up —
        // treat it the same as offline rather than lose the thought.
        if (!queueCapture(rawText, "TEXT", user?.id)) {
          setError(
            "No se pudo guardar en el dispositivo. El texto sigue aquí.",
          );
          setSubmitting(false);
          return;
        }
        setText("");
        setQueuedNotice(true);
        setTimeout(() => {
          onCaptured?.();
          onClose();
        }, 900);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="glass-panel w-full max-w-lg animate-fade-in p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-nexus-muted">
            CAPTURA RÁPIDA
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-nexus-muted transition-colors hover:text-nexus-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí lo que se te ocurra…"
          rows={3}
          className="w-full resize-none rounded-xl border border-nexus-border bg-black/30 p-3 text-nexus-text placeholder:text-nexus-muted focus:border-nexus-cyan focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-nexus-danger">{error}</p>}
        {queuedNotice && (
          <p className="mt-2 text-sm text-nexus-amber">
            Sin conexión — lo guardé en el teléfono y lo sincronizo apenas
            vuelva internet.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            disabled
            title="Próximamente"
            className="flex items-center gap-2 rounded-full border border-nexus-border px-3 py-1.5 text-sm text-nexus-muted opacity-50"
          >
            🎙 Hablar
          </button>
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="rounded-full bg-nexus-cyan px-5 py-1.5 text-sm font-medium text-nexus-bg transition-opacity disabled:opacity-40"
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
