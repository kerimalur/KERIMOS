import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warmes Papier: cremiger Grund, nichts ist reines Weiss oder Schwarz.
        paper: "#FAF8F3",
        card: "#FFFDF9",
        sand: "#F1EDE2",
        line: "#E8E3D8",
        "line-strong": "#D8D0C0",
        ink: {
          DEFAULT: "#3A362E",
          soft: "#5C5648",
          muted: "#8A8478",
          faint: "#ABA294",
        },
        accent: {
          DEFAULT: "#5B8C7B",
          soft: "#4A7566",
          tint: "#E6EFEA",
        },
        good: "#4E8A6E",
        warn: "#A87C3C",
        bad: "#A65F52",
        "good-tint": "#E6EFE9",
        "warn-tint": "#F6EEDF",
        "bad-tint": "#F7E9E4",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
