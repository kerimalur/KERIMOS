import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Tactile: warmes Dunkel. Nichts ist reines Schwarz oder Weiss;
        // der Grund hat einen Braunstich, damit die Farben darauf leuchten.
        paper: "#17130F",       // Seitengrund
        card: "#1E1811",        // Karte, eine Stufe heller
        sand: "#271F16",        // Fläche in der Karte (Chips, Zeilen)
        field: "#221B14",       // Eingabefelder
        line: "#2E2519",        // Kante, nur angedeutet
        "line-strong": "#3E3222",
        ink: {
          DEFAULT: "#F5EFE3",   // Haupttext
          soft: "#CBC0AC",
          muted: "#9A8C74",
          faint: "#7A6E5C",
          // Text auf farbig gefüllten Flächen (Buttons, aktive Chips)
          on: "#17130F",
        },
        accent: {
          DEFAULT: "#E7A96B",   // Bernstein — die Hausfarbe
          soft: "#F0BC85",
          deep: "#B4813F",
          tint: "#3A2A20",
        },
        good: "#5FC2A6",
        warn: "#E7A96B",
        bad: "#E28B72",
        "good-tint": "#1C2B23",
        "warn-tint": "#3A2A20",
        "bad-tint": "#2E1C1A",
        // hellere Varianten für grosse Zahlen auf dunklem Grund
        "good-bright": "#7EE0C6",
        "bad-bright": "#F0A08A",

        // ── Bereichsfarben. Jeder Bereich hat einen Ton und einen Grund —
        // so sind Geld, Zeit, Gym, Essen und Trading auf einen Blick
        // auseinanderzuhalten.
        geld: { DEFAULT: "#5FC2A6", bg: "#1C2B23", bright: "#7EE0C6" },
        zeit: { DEFAULT: "#6FA3D8", bg: "#1E2E3A", bright: "#A7CBEC" },
        gym: { DEFAULT: "#E28B72", bg: "#3A2A20", bright: "#F0A08A" },
        essen: { DEFAULT: "#ACB56E", bg: "#2C301E", bright: "#C8D394" },
        trading: { DEFAULT: "#A38EDD", bg: "#2A2438", bright: "#C4B4EE" },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-manrope)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Tactile ist runder als vorher: Karten 22px, Chips 14px
        xl: "0.875rem",
        "2xl": "1.375rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Kein harter Schlagschatten, sondern ein tiefer, weicher Sockel
        tile: "0 14px 28px -18px rgba(0,0,0,.75)",
        card: "0 16px 32px -20px rgba(0,0,0,.6)",
        "glow-accent": "0 14px 28px -18px rgba(231,169,107,.35)",
        "glow-geld": "0 14px 28px -18px rgba(95,194,166,.32)",
        "glow-zeit": "0 14px 28px -18px rgba(111,163,216,.32)",
        "glow-gym": "0 14px 28px -18px rgba(226,139,114,.32)",
        "glow-essen": "0 14px 28px -18px rgba(172,181,110,.32)",
        "glow-trading": "0 14px 28px -18px rgba(163,142,221,.32)",
      },
      keyframes: {
        popIn: {
          from: { opacity: "0", transform: "scale(.94) translateY(6px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        revealW: { from: { width: "0%" }, to: { width: "var(--w, 100%)" } },
        revealH: { from: { height: "0%" }, to: { height: "var(--h, 100%)" } },
        drawLine: { to: { strokeDashoffset: "0" } },
        driftA: {
          "0%": { transform: "translate(-8%,-6%) scale(1)" },
          "50%": { transform: "translate(14%,8%) scale(1.18)" },
          "100%": { transform: "translate(-4%,14%) scale(.92)" },
        },
        driftB: {
          "0%": { transform: "translate(10%,14%) scale(1.1)" },
          "50%": { transform: "translate(-14%,-6%) scale(.88)" },
          "100%": { transform: "translate(6%,-14%) scale(1.05)" },
        },
        driftC: {
          "0%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-12%,9%) scale(1.22)" },
          "100%": { transform: "translate(10%,-9%) scale(.9)" },
        },
      },
      animation: {
        pop: "popIn .38s cubic-bezier(.34,1.56,.64,1) both",
        "pop-fast": "popIn .32s cubic-bezier(.34,1.56,.64,1) both",
        revealW: "revealW .55s cubic-bezier(.34,1.56,.64,1) both",
        revealH: "revealH .5s cubic-bezier(.34,1.56,.64,1) both",
        drawLine: "drawLine 1.1s .15s cubic-bezier(.16,1,.3,1) forwards",
        driftA: "driftA 32s ease-in-out infinite alternate",
        driftB: "driftB 40s ease-in-out infinite alternate",
        driftC: "driftC 46s ease-in-out infinite alternate",
      },
      transitionTimingFunction: {
        tactile: "cubic-bezier(.34,1.56,.64,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
