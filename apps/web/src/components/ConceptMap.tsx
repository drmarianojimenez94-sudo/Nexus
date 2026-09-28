"use client";

import { NexusFace, type FaceState } from "./NexusFace";

export interface ConceptNode {
  path: string;
  label: string;
}

/**
 * The conceptual "rooms" NEXUS can fly you to by voice. Fixed for V1 —
 * each one already has a real screen behind it. A natural V2 extension is
 * swapping the Projects/Areas nodes for the user's actual project/area
 * names once there's room to keep the map legible at a glance.
 */
export const CONCEPT_NODES: ConceptNode[] = [
  { path: "/today", label: "Hoy" },
  { path: "/inbox", label: "Inbox" },
  { path: "/calendar", label: "Calendario" },
  { path: "/projects", label: "Proyectos" },
  { path: "/areas", label: "Áreas" },
  { path: "/memory", label: "Memoria" },
];

interface ConceptMapProps {
  /** Path of the node NEXUS is taking you to, or null to show the map at rest. */
  target: string | null;
  faceState: FaceState;
}

/**
 * Turns "llevame a proyectos" into something that feels like NEXUS
 * flying you there through a map of your own world, instead of a plain
 * page cut. The Face sits at the center; the six conceptual rooms are
 * placed on a ring around it with real depth (translateZ) inside a
 * perspective container — same CSS 3D approach as the Face's crystal
 * shell, not a flat illusion. A beam lights up from center to whichever
 * node is the current voice command's destination.
 */
export function ConceptMap({ target, faceState }: ConceptMapProps) {
  const activeIndex = CONCEPT_NODES.findIndex((n) => n.path === target);
  const radius = 128;

  return (
    <div className="relative" style={{ width: 320, height: 320, perspective: 1000 }}>
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {CONCEPT_NODES.map((node, i) => {
          const angle = (Math.PI * 2 * i) / CONCEPT_NODES.length - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const active = i === activeIndex;
          const z = active ? 36 : -18 + (i % 2) * 12;
          const angleDeg = (angle * 180) / Math.PI;

          return (
            <div key={node.path}>
              <div
                className="absolute h-px origin-left bg-gradient-to-r from-nexus-cyan/40 to-transparent transition-opacity duration-700"
                style={{
                  width: radius,
                  left: "50%",
                  top: "50%",
                  transform: `rotate(${angleDeg}deg)`,
                  opacity: active ? 0.8 : 0.12,
                }}
              />
              <div
                className={`absolute whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-all duration-700 ${
                  active
                    ? "scale-110 border-nexus-cyan bg-nexus-cyan/15 text-nexus-cyan shadow-glow"
                    : "border-nexus-border bg-nexus-panel/70 text-nexus-muted"
                }`}
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%)`,
                }}
              >
                {node.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute left-1/2 top-1/2" style={{ transform: "translate3d(-50%, -50%, 60px)" }}>
        <NexusFace state={faceState} size={88} aria-label="NEXUS" />
      </div>
    </div>
  );
}
