"use client";

export type FaceState = "idle" | "listening" | "thinking" | "speaking" | "action-required" | "offline";

const MOUTH_BARS = 5;

const EYE_ANIMATION: Record<FaceState, string> = {
  idle: "animate-eye-blink",
  listening: "animate-eye-alert",
  thinking: "",
  speaking: "",
  "action-required": "animate-eye-alert",
  offline: "",
};

const MOUTH_ANIMATION: Record<FaceState, string> = {
  idle: "animate-mouth-idle",
  listening: "animate-mouth-listen",
  thinking: "",
  speaking: "animate-mouth-speak",
  "action-required": "animate-mouth-idle",
  offline: "",
};

const EYE_COLOR: Record<FaceState, string> = {
  idle: "bg-nexus-cyan",
  listening: "bg-nexus-cyan",
  thinking: "bg-nexus-violet",
  speaking: "bg-nexus-cyan",
  "action-required": "bg-nexus-amber",
  offline: "bg-nexus-muted",
};

const GLOW: Record<FaceState, string> = {
  idle: "shadow-glow",
  listening: "shadow-glow",
  thinking: "shadow-glow-violet",
  speaking: "shadow-glow",
  "action-required": "shadow-[0_0_24px_rgba(245,185,92,0.45)]",
  offline: "shadow-none opacity-50",
};

interface NexusFaceProps {
  state?: FaceState;
  size?: number;
  onClick?: () => void;
  "aria-label"?: string;
}

/**
 * The Nexus Face (spec §28, evolved from the original Orb concept per
 * product direction): an abstract, GPU-cheap face — two eyes, a
 * waveform mouth — instead of a literal rendered face. Reads as "alive"
 * at any size, costs almost nothing to animate, and is what Voice
 * (Phase 2) drives via `state` once STT/TTS exist. Today only `idle` is
 * wired to real interaction (tap → Quick Capture); `listening` /
 * `thinking` / `speaking` are ready for the moment there's audio to
 * react to.
 */
export function NexusFace({ state = "idle", size = 64, onClick, ...rest }: NexusFaceProps) {
  const eyeHeight = Math.max(size * 0.16, 6);
  const eyeWidth = Math.max(size * 0.09, 3);
  const eyeGap = size * 0.28;
  const barWidth = Math.max(size * 0.045, 2);
  const barMaxHeight = size * 0.14;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rest["aria-label"] ?? "Abrir NEXUS"}
      className={`relative flex shrink-0 items-center justify-center rounded-full border border-nexus-border bg-nexus-panel/80 backdrop-blur-xl transition-transform active:scale-95 ${GLOW[state]}`}
      style={{ width: size, height: size }}
    >
      {state === "thinking" && (
        <span
          className="absolute inset-[-3px] rounded-full opacity-70 animate-face-scan"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, #8b7bff 15%, transparent 30%)",
          }}
        />
      )}

      <div className="relative flex flex-col items-center gap-[18%]">
        <div className="flex items-center" style={{ gap: eyeGap }}>
          {[0, 1].map((i) => (
            <span
              key={i}
              className={`rounded-full ${EYE_COLOR[state]} ${EYE_ANIMATION[state]}`}
              style={{ width: eyeWidth, height: eyeHeight }}
            />
          ))}
        </div>

        <div className="flex items-end justify-center" style={{ gap: barWidth * 0.8, height: barMaxHeight }}>
          {Array.from({ length: MOUTH_BARS }).map((_, i) => (
            <span
              key={i}
              className={`origin-bottom rounded-full ${EYE_COLOR[state]} ${MOUTH_ANIMATION[state]}`}
              style={{
                width: barWidth,
                height: barMaxHeight,
                animationDelay: `${i * 90}ms`,
                animationDuration: state === "listening" || state === "speaking" ? `${0.45 + i * 0.05}s` : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </button>
  );
}
