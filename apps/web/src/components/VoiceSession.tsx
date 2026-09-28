"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConceptMap } from "./ConceptMap";
import { type FaceState } from "./NexusFace";
import { QuickCaptureModal } from "./QuickCaptureModal";
import { useSpeech } from "@/lib/useSpeech";
import { handleVoiceCommand } from "@/lib/voiceCommands";

interface VoiceSessionProps {
  onClose: () => void;
}

/** How long the Face "travels" across the conceptual map before the real navigation happens. */
const MAP_TRANSIT_MS = 900;

/**
 * Nexus Voice V1.5 (spec §4/§5): tap the Face, then it's fully hands-free
 * — listen, act, speak the result, listen again — until you say "listo"
 * or close it. Falls back to the existing text Quick Capture automatically
 * when the browser has no SpeechRecognition (iOS Safari, every browser on
 * iOS — Apple doesn't ship it), so the feature that already works never
 * regresses for that third of users.
 */
export function VoiceSession({ onClose }: VoiceSessionProps) {
  const router = useRouter();
  const { sttSupported, listening, speaking, interimTranscript, speak, startListening, stopListening } =
    useSpeech();
  const [lastHeard, setLastHeard] = useState("");
  const [lastSpoken, setLastSpoken] = useState("Te escucho.");
  const [mapTarget, setMapTarget] = useState<string | null>(null);
  const closingRef = useRef(false);

  const faceState: FaceState = speaking ? "speaking" : listening ? "listening" : "thinking";

  async function handleResult(text: string) {
    setLastHeard(text);
    const result = await handleVoiceCommand(text);
    setLastSpoken(result.speak);

    if (result.navigateTo) {
      // Show the conceptual map with the destination lit up while NEXUS
      // speaks, so navigating by voice feels like being taken somewhere,
      // not a flat page cut — then actually navigate once the beat lands.
      setMapTarget(result.navigateTo);
      await speak(result.speak);
      await new Promise((resolve) => setTimeout(resolve, MAP_TRANSIT_MS));
      setMapTarget(null);
      router.push(result.navigateTo);
    } else {
      await speak(result.speak);
    }

    if (result.close || closingRef.current) {
      onClose();
      return;
    }
    startListening(handleResult);
  }

  useEffect(() => {
    if (!sttSupported) return;
    let cancelled = false;
    (async () => {
      await speak("Te escucho.");
      if (!cancelled) startListening(handleResult);
    })();
    return () => {
      cancelled = true;
      closingRef.current = true;
      stopListening();
    };
  }, [sttSupported]);

  function handleClose() {
    closingRef.current = true;
    stopListening();
    onClose();
  }

  if (!sttSupported) {
    // No microphone recognition here (most likely iOS Safari) — the text
    // flow that already works end to end, not a dead end.
    return <QuickCaptureModal onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-nexus-bg px-6 text-center">
      <ConceptMap target={mapTarget} faceState={faceState} />

      <div className="max-w-sm">
        <p className="text-lg">{lastSpoken}</p>
        {(interimTranscript || lastHeard) && (
          <p className="mt-3 text-sm text-nexus-muted">"{interimTranscript || lastHeard}"</p>
        )}
        {listening && !interimTranscript && <p className="mt-3 text-sm text-nexus-cyan">Escuchando…</p>}
      </div>

      <button
        onClick={handleClose}
        className="rounded-full border border-nexus-border px-5 py-2 text-sm text-nexus-muted"
      >
        Cerrar
      </button>
    </div>
  );
}
