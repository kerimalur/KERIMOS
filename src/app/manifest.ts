import type { MetadataRoute } from "next";

/**
 * Macht KerimOS auf dem Handy installierbar (Chrome: "Zum Startbildschirm
 * hinzufügen"). Die App öffnet dann randlos wie eine native App.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KerimOS",
    short_name: "KerimOS",
    description: "Zeit, Geld und Ziele an einem Ort.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F3",
    theme_color: "#FAF8F3",
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Schnellerfassung", url: "/quick" },
      { name: "Zeit erfassen", url: "/kalender" },
      { name: "Trading", url: "/trading" },
    ],
  };
}
