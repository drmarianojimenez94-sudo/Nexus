import type { Config } from "tailwindcss";

/**
 * NEXUS UI design tokens (spec §28). Dark, translucent, precise — a HUD
 * feeling of our own, not a literal skin of any existing franchise.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#05070c",
          panel: "#0d121f",
          border: "rgba(148, 197, 255, 0.12)",
          cyan: "#4fd8ff",
          violet: "#8b7bff",
          text: "#e7ecf7",
          muted: "#8791a8",
          amber: "#f5b95c",
          danger: "#ff6b6b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(79, 216, 255, 0.35)",
        "glow-violet": "0 0 24px rgba(139, 123, 255, 0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Nexus Face — eyes blink rarely so idle doesn't feel robotic.
        "eye-blink": {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "96%": { transform: "scaleY(0.08)" },
        },
        "eye-alert": {
          "0%, 100%": { transform: "scaleY(1)", opacity: "1" },
          "50%": { transform: "scaleY(1.15)", opacity: "0.85" },
        },
        // Mouth is a row of bars; each gets a slightly different duration/
        // delay in the component so the set reads as one waveform, not a
        // single element looping.
        "mouth-idle": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(0.5)" },
        },
        "mouth-listen": {
          "0%, 100%": { transform: "scaleY(0.25)" },
          "30%": { transform: "scaleY(1)" },
          "60%": { transform: "scaleY(0.5)" },
          "80%": { transform: "scaleY(0.85)" },
        },
        "mouth-speak": {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "25%": { transform: "scaleY(1)" },
          "50%": { transform: "scaleY(0.55)" },
          "75%": { transform: "scaleY(0.9)" },
        },
        "face-scan": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "panel-deploy": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Nexus Face crystal shell — real 3D rotation (rotateY) composed
        // through a preserve-3d parent, not a flat illusion.
        "face-spin": {
          "0%": { transform: "rotateY(0deg) rotateX(-4deg)" },
          "50%": { transform: "rotateY(180deg) rotateX(4deg)" },
          "100%": { transform: "rotateY(360deg) rotateX(-4deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "eye-blink": "eye-blink 6s ease-in-out infinite",
        "eye-alert": "eye-alert 1s ease-in-out infinite",
        "mouth-idle": "mouth-idle 3s ease-in-out infinite",
        "mouth-listen": "mouth-listen 0.6s ease-in-out infinite",
        "mouth-speak": "mouth-speak 0.45s ease-in-out infinite",
        "face-scan": "face-scan 2.4s linear infinite",
        "panel-deploy": "panel-deploy 0.35s ease-out backwards",
        "face-spin": "face-spin 16s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
