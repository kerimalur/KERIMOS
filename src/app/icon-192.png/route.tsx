import { ImageResponse } from "next/og";

/**
 * App-Symbol als echtes PNG: vier Kacheln, eine ausgefüllt.
 *
 * Chrome bietet "Installieren" nur an, wenn das Manifest PNG-Symbole in
 * 192 und 512 Pixeln nennt. Erzeugt wird es hier zur Laufzeit, damit keine
 * Binärdatei ins Repository muss. Gezeichnet mit divs statt SVG - Satori
 * (die Grundlage von ImageResponse) beherrscht nur einen Teil von SVG.
 */
export const dynamic = "force-static";

function kacheln(größe: number) {
  const kachel = größe * 0.229;
  const radius = größe * 0.0625;
  const lücke = größe * 0.0625;

  const feld = (deckkraft: number) => ({
    width: kachel, height: kachel, borderRadius: radius,
    background: "#241708", opacity: deckkraft,
  });

  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex",
        alignItems: "center", justifyContent: "center", background: "#E7A96B",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: lücke }}>
        <div style={{ display: "flex", gap: lücke }}>
          <div style={feld(1)} />
          <div style={feld(0.45)} />
        </div>
        <div style={{ display: "flex", gap: lücke }}>
          <div style={feld(0.45)} />
          <div style={feld(0.45)} />
        </div>
      </div>
    </div>
  );
}

export function GET() {
  return new ImageResponse(kacheln(192), { width: 192, height: 192 });
}
