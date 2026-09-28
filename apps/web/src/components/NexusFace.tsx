"use client";

export type FaceState = "idle" | "listening" | "thinking" | "speaking" | "action-required" | "offline";

const MOUTH_BARS = 5;
const FACET_COUNT = 6;

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

const FACET_RGB: Record<FaceState, string> = {
  idle: "79, 216, 255",
  listening: "79, 216, 255",
  thinking: "139, 123, 255",
  speaking: "79, 216, 255",
  "action-required": "245, 185, 92",
  offline: "135, 145, 168",
};

const GLOW: Record<FaceState, string> = {
  idle: "shadow-glow",
  listening: "shadow-glow",
  thinking: "shadow-glow-violet",
  speaking: "shadow-glow",
  "action-required": "shadow-[0_0_24px_rgba(245,185,92,0.45)]",
  offline: "shadow-none opacity-50",
};

const SPIN_DURATION: Record<FaceState, string> = {
  idle: "16s",
  listening: "9s",
  thinking: "5s",
  speaking: "9s",
  "action-required": "6s",
  offline: "0s",
};

interface NexusFaceProps {
  state?: FaceState;
  size?: number;
  onClick?: () => void;
  "aria-label"?: string;
}

/**
 * A slowly-rotating faceted shell rendered with real CSS 3D transforms
 * (perspective + preserve-3d), not a flat illusion. Each facet is a plane
 * positioned in 3D space around a Y-axis ring; the parent's own rotation
 * animation carries all of them together, which is how nested preserve-3d
 * composes in CSS. Facet count and radius scale with `size` so this reads
 * right from a 40px sidebar icon up to a 96px onboarding hero.
 */
function CrystalShell({ state, size }: { state: FaceState; size: number }) {
  const radius = size * 0.42;
  const facetSize = size * 0.6;
  const rgb = FACET_RGB[state];

  return (
    <div
      className="absolute inset-0"
      style={{ perspective: size * 3.2, animation: state === "offline" ? "none" : undefined }}
    >
      <div
        className="absolute inset-0 animate-face-spin"
        style={{
          transformStyle: "preserve-3d",
          animationDuration: SPIN_DURATION[state],
          animationPlayState: state === "offline" ? "paused" : "running",
        }}
      >
        {Array.from({ length: FACET_COUNT }).map((_, i) => {
          const angle = (360 / FACET_COUNT) * i;
          return (
            <span
              key={`ring-${i}`}
              className="absolute rounded-md border"
              style={{
                width: facetSize,
                height: facetSize,
                top: "50%",
                left: "50%",
                marginTop: -facetSize / 2,
                marginLeft: -facetSize / 2,
                transform: `rotateY(${angle}deg) rotateX(8deg) translateZ(${radius}px)`,
                background: `linear-gradient(160deg, rgba(${rgb}, ${0.22 + (i % 2) * 0.08}), rgba(${rgb}, 0.03))`,
                borderColor: `rgba(${rgb}, 0.35)`,
              }}
            />
          );
        })}
        <span
          className="absolute rounded-full border"
          style={{
            width: facetSize * 0.9,
            height: facetSize * 0.9,
            top: "50%",
            left: "50%",
            marginTop: (-facetSize * 0.9) / 2,
            marginLeft: (-facetSize * 0.9) / 2,
            transform: `rotateX(90deg) translateZ(${radius}px)`,
            background: `radial-gradient(circle, rgba(${rgb}, 0.25), transparent 70%)`,
            borderColor: `rgba(${rgb}, 0.25)`,
          }}
        />
        <span
          className="absolute rounded-full border"
          style={{
            width: facetSize * 0.9,
            height: facetSize * 0.9,
            top: "50%",
            left: "50%",
            marginTop: (-facetSize * 0.9) / 2,
            marginLeft: (-facetSize * 0.9) / 2,
            transform: `rotateX(-90deg) translateZ(${radius}px)`,
            background: `radial-gradient(circle, rgba(${rgb}, 0.25), transparent 70%)`,
            borderColor: `rgba(${rgb}, 0.25)`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The Nexus Face (spec §28, evolved from the original Orb concept per
 * product direction): a geometric 3D crystal shell (real CSS 3D
 * transforms, not a flat trick) rotating slowly around a flat, always
 * front-facing eyes+mouth plate. GPU-cheap — only `transform` is
 * animated, nothing that triggers layout — and reads as "alive" at any
 * size. Six states drive both the flat plate and the shell's color/spin
 * speed; Voice (Phase 2) will feed `state` from real audio instead of
 * this component inventing it.
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
      className={`relative flex shrink-0 items-center justify-center transition-transform active:scale-95 ${GLOW[state]}`}
      style={{ width: size, height: size }}
    >
      <CrystalShell state={state} size={size} />

      <div className="absolute inset-[8%] rounded-full border border-nexus-border bg-nexus-panel/75 backdrop-blur-xl" />

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
