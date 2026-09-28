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
        "orb-idle": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.04)", opacity: "1" },
        },
        "orb-listen": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.12)" },
        },
        "orb-think": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "orb-idle": "orb-idle 4s ease-in-out infinite",
        "orb-listen": "orb-listen 1.1s ease-in-out infinite",
        "orb-think": "orb-think 1.6s linear infinite",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
