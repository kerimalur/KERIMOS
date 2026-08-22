import type { MetadataRoute } from "next";

/**
 * Macht KerimOS installierbar. Chrome verlangt für ein echtes "Installieren"
 * (statt nur "Zum Startbildschirm hinzufügen"): eindeutige id, start_url im
 * scope, display standalone und PNG-Symbole in 192 und 512 Pixeln - die
 * liefern die Routen /icon-192.png und /icon-512.png.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KerimOS",
    short_name: "KerimOS",
    description: "Zeit, Geld, Training und Trading an einem Ort.",
    // Bewusst die normale Startseite: am Computer die volle Ansicht, auf dem
    // Die Startseite ist auf jedem Gerät dieselbe - kein Umweg mehr.
    start_url: "/",
    scope: "/",
    display: "standalone",
    // "any" statt portrait - am Desktop wäre Hochformat erzwungener Unsinn
    orientation: "any",
    background_color: "#FAF8F3",
    theme_color: "#5B8C7B",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Heute", url: "/heute" },
      { name: "Trading", url: "/trading" },
    ],
  };
}
