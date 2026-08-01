import { ImageResponse } from "next/og";

/** Dasselbe Zeichen in 512 Pixeln - Pflichtgrösse für die Installation. */
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
  return new ImageResponse(kacheln(512), { width: 512, height: 512 });
}
