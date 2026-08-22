import { NextResponse, type NextRequest } from "next/server";
import { baueHitDetail } from "@/lib/trading/hit-detail";
import { tradingConfigured } from "@/lib/supabase/trading";

/**
 * Die Detailkarte zu einem GVA-Hit — geladen, wenn Kerim im Cockpit auf eine
 * umkreiste Kachel drückt.
 *
 * Als Route und nicht als vorgerendertes Server-Fragment, weil die
 * Saisonalität rund 5000 Tagesschlüsse je Paar zieht. Alles im Voraus zu laden
 * würde die Cockpit-Seite für jeden Hit langsamer machen, den Kerim gar nicht
 * anschaut; ein Server-Fragment je Kachel hätte dasselbe Problem.
 *
 * Die Anmeldung erledigt die Middleware — `/api/trading/…` steht nicht in
 * ihrer Ausnahmeliste und ist damit wie jede Seite geschützt.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!tradingConfigured()) {
    return NextResponse.json({ fehler: "Trading-Datenbank nicht verbunden." }, { status: 503 });
  }

  const q = request.nextUrl.searchParams;
  const paar = (q.get("paar") ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const seite = q.get("seite") === "short" ? "short" : "long";
  const level = Number(q.get("level"));
  const formiert = q.get("formiert");

  if (paar.length !== 6 || !Number.isFinite(level)) {
    return NextResponse.json({ fehler: "Paar oder Level fehlt." }, { status: 400 });
  }

  try {
    const detail = await baueHitDetail(
      paar, seite, level,
      formiert && /^\d{4}-\d{2}-\d{2}$/.test(formiert) ? formiert : null,
    );
    return NextResponse.json(detail);
  } catch (e) {
    console.error("hit-detail:", e);
    return NextResponse.json({ fehler: "Konnte die Lage nicht laden." }, { status: 500 });
  }
}
