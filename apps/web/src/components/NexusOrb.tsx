"use client";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "action-required" | "offline";

const STATE_ANIMATION: Record<OrbState, string> = {
  idle: "animate-orb-idle",
  listening: "animate-orb-listen",
  thinking: "animate-orb-think",
  speaking: "animate-orb-listen",
  "action-required": "animate-pulse",
  offline: "",
};

const STATE_GLOW: Record<OrbState, string> = {
  idle: "shadow-glow",
  listening: "shadow-glow",
  thinking: "shadow-glow-violet",
  speaking: "shadow-glow",
  "action-required": "shadow-[0_0_24px_rgba(245,185,92,0.45)]",
  offline: "shadow-none opacity-50",
};

interface NexusOrbProps {
  state?: OrbState;
  size?: number;
  onClick?: () => void;
  "aria-label"?: string;
}

/**
 * The NEXUS Orb (spec §3/§28): the visual center of the product. Phase 1
 * gives it a calm idle presence and wires tap → Quick Capture; the full
 * listening/thinking/speaking choreography lands with Nexus Voice (Phase 2).
 */
export function NexusOrb({ state = "idle", size = 64, onClick, ...rest }: NexusOrbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rest["aria-label"] ?? "Abrir NEXUS"}
      className={`relative flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 ${STATE_GLOW[state]}`}
      style={{ width: size, height: size }}
    >
      <span
        className={`absolute inset-0 rounded-full bg-gradient-to-br from-nexus-cyan via-nexus-violet to-nexus-cyan ${STATE_ANIMATION[state]}`}
      />
      <span className="absolute inset-[3px] rounded-full bg-nexus-bg" />
      <span className="absolute inset-[9px] rounded-full bg-gradient-to-br from-nexus-cyan/80 to-nexus-violet/80 blur-[2px]" />
    </button>
  );
}
