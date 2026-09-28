"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface QuickCaptureModalProps {
  onClose: () => void;
  onCaptured?: () => void;
}

/**
 * Always-reachable capture (spec §11): dump a thought without classifying
 * it. Voice capture is stubbed until Nexus Voice (Phase 2) lands; text
 * works end to end today.
 */
export function QuickCaptureModal({ onClose, onCaptured }: QuickCaptureModalProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/quick-capture", { rawText: text.trim(), source: "TEXT" });
      setText("");
      onCaptured?.();
      onClose();
    } catch {
      setError("No se pudo guardar. Probá de nuevo.");
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
          <h2 className="text-sm font-medium tracking-wide text-nexus-muted">CAPTURA RÁPIDA</h2>
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
