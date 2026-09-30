import type { FaceState } from "./NexusFace";

/** Decorative reactor; state comes from actual microphone/speech activity. */
export function NexusCore({ size = 64, state = "idle" }: { size?: number; state?: FaceState }) {
  return <span className="nexus-core" data-state={state} style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 100 100" className="nexus-core-orbits">
      <circle cx="50" cy="50" r="46" strokeDasharray="45 8 2 8" />
      <circle cx="50" cy="50" r="36" strokeDasharray="2 6" />
      <path d="M50 3v8M50 89v8M3 50h8M89 50h8M17 17l6 6M77 77l6 6M17 83l6-6M77 23l6-6" />
    </svg>
    <span className="nexus-core-light" />
  </span>;
}
