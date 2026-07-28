import { ImageResponse } from "next/og";

/** Dasselbe Symbol in 512 Pixeln - Pflichtgrösse für die Installation. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "#5B8C7B", color: "#FFFFFF",
          fontSize: 310, fontWeight: 500,
        }}
      >
        K
      </div>
    ),
    { width: 512, height: 512 }
  );
}
