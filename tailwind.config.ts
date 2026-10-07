import type { Config } from "tailwindcss";

/**
 * Design D „Fokus mit Brett“ (07.10.2026).
 *
 * Alle Farben stehen als RGB-Kanäle in CSS-Variablen (globals.css), je einmal
 * für hell (:root) und dunkel (.dark). So schaltet ein Klassenwechsel auf
 * <html> die ganze App um, und `bg-card/80` & Co. funktionieren weiter.
 * Die Namen sind dieselben wie vorher — keine Seite musste umbenannt werden.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: v("paper"),        // Seitengrund
        card: v("card"),          // Karte
        sand: v("sand"),          // Fläche in der Karte (Chips, Zeilen)
        field: v("field"),        // Eingabefelder
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
          faint: v("ink-faint"),
          on: v("ink-on"),        // Text auf gefüllten Akzentflächen
        },
        accent: {
          DEFAULT: v("accent"),   // Kobalt — die Hausfarbe von D
          soft: v("accent-soft"),
          deep: v("accent-deep"),
          tint: v("accent-tint"),
        },
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        "good-tint": v("good-tint"),
        "warn-tint": v("warn-tint"),
        "bad-tint": v("bad-tint"),
        "good-bright": v("good-bright"),
        "bad-bright": v("bad-bright"),
        // Bereichsfarben, unverändert in der Bedeutung
        geld: { DEFAULT: v("geld"), bg: v("geld-bg"), bright: v("geld-bright") },
        zeit: { DEFAULT: v("zeit"), bg: v("zeit-bg"), bright: v("zeit-bright") },
        gym: { DEFAULT: v("gym"), bg: v("gym-bg"), bright: v("gym-bright") },
        essen: { DEFAULT: v("essen"), bg: v("essen-bg"), bright: v("essen-bright") },
        trading: { DEFAULT: v("trading"), bg: v("trading-bg"), bright: v("trading-bright") },
        // Die Fotoflächen (Empfang, Titelbilder) sind in beiden Modi dunkel.
        photo: "#F5F4F1",
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-bricolage)", "var(--font-hanken)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.375rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        tile: "0 10px 24px -16px rgb(var(--c-shadow) / .45)",
        card: "0 1px 2px rgb(var(--c-shadow) / .04), 0 12px 30px -18px rgb(var(--c-shadow) / .30)",
        float: "0 10px 30px -12px rgb(var(--c-shadow) / .35)",
        // Die alten Leuchtschatten bleiben als Namen, sind in D aber leise.
        "glow-accent": "0 12px 26px -18px rgb(var(--c-accent) / .45)",
        "glow-geld": "0 12px 26px -18px rgb(var(--c-geld) / .40)",
        "glow-zeit": "0 12px 26px -18px rgb(var(--c-zeit) / .40)",
        "glow-gym": "0 12px 26px -18px rgb(var(--c-gym) / .40)",
        "glow-essen": "0 12px 26px -18px rgb(var(--c-essen) / .40)",
        "glow-trading": "0 12px 26px -18px rgb(var(--c-trading) / .40)",
      },
      keyframes: {
        popIn: {
          from: { opacity: "0", transform: "scale(.97) translateY(6px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        revealW: { from: { width: "0%" }, to: { width: "var(--w, 100%)" } },
        revealH: { from: { height: "0%" }, to: { height: "var(--h, 100%)" } },
        drawLine: { to: { strokeDashoffset: "0" } },
        // D: Brett setzt sich zusammen, Zeilen steigen auf, das Bild atmet.
        assemble: {
          from: { opacity: "0", clipPath: "inset(100% 0 0 0)" },
          to: { opacity: "1", clipPath: "inset(0 0 0 0)" },
        },
        lineup: { from: { transform: "translateY(105%)" }, to: { transform: "none" } },
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
        kenburns: {
          from: { transform: "scale(1.12) translate3d(-1.2%,-1%,0)" },
          to: { transform: "scale(1.02) translate3d(1.2%,1%,0)" },
        },
        bannerIn: {
          from: { opacity: ".35", transform: "scale(1.08)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        pop: "popIn .4s cubic-bezier(.16,1,.3,1) both",
        "pop-fast": "popIn .3s cubic-bezier(.16,1,.3,1) both",
        revealW: "revealW .6s cubic-bezier(.16,1,.3,1) both",
        revealH: "revealH .55s cubic-bezier(.16,1,.3,1) both",
        drawLine: "drawLine 1.1s .15s cubic-bezier(.16,1,.3,1) forwards",
        assemble: "assemble .9s cubic-bezier(.16,1,.3,1) both",
        lineup: "lineup 1s cubic-bezier(.16,1,.3,1) both",
        rise: "rise .8s cubic-bezier(.16,1,.3,1) both",
        kenburns: "kenburns 28s ease-in-out infinite alternate",
        bannerIn: "bannerIn 1.4s cubic-bezier(.16,1,.3,1) both",
      },
      transitionTimingFunction: {
        // Name bleibt (wird in vielen Komponenten benutzt), die Kurve ist
        // in D ruhiger: weich auslaufend statt federnd.
        tactile: "cubic-bezier(.16,1,.3,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
