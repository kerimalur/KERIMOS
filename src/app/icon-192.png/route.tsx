import { ImageResponse } from "next/og";

/**
 * App-Symbol als echtes PNG.
 *
 * Chrome bietet "Installieren" nur an, wenn das Manifest PNG-Symbole in
 * 192 und 512 Pixeln nennt - mit einer SVG-Datei bleibt es bei "Verknüpfung
 * hinzufügen". Erzeugt wird es hier zur Laufzeit, damit keine Binärdatei ins
 * Repository muss.
 */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "#5B8C7B", color: "#FFFFFF",
          fontSize: 116, fontWeight: 500,
        }}
      >
        K
      </div>
    ),
    { width: 192, height: 192 }
  );
}
