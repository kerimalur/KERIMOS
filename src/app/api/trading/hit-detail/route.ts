import { NextResponse, type NextRequest } from "next/server";
import { baueHitChart, baueHitLage } from "@/lib/trading/hit-detail";
import { tradingConfigured } from "@/lib/supabase/trading";

/**
 * Die Detailkarte zu einem GVA-Hit — geladen, wenn Kerim im Cockpit auf eine
 * umkreiste Kachel drückt.
 *
 * Zwei Teile über `?teil=`: **chart** holt Kerzen vom Screener-Backend,
 * **lage** holt Ranking, COT und Kurshistorie aus Supabase. Getrennt, weil sie
 * aus verschiedenen Systemen kommen und verschieden lange brauchen — das
 * Popup soll den Chart zeigen, sobald er da ist, statt auf den COT-Bericht zu
 * warten, und umgekehrt.
 *
 * Als Route und nicht als vorgerendertes Server-Fragment, weil die
 * Saisonalität rund 5000 Tagesschlüsse je Paar zieht. Alles im Voraus zu laden
 * würde die Cockpit-Seite für jeden Hit langsamer machen, den Kerim gar nicht
 * anschaut.
 *
 * Die Anmeldung erledigt die Middleware — `/api/trading/…` steht nicht in
 * ihrer Ausnahmeliste und ist damit wie jede Seite geschützt.
 */
export const dynamic = "force-dynamic";

// Die COT-Abfrage zieht 1250 Tage aus mehreren Tabellen. Beim ersten Aufruf
// nach einem Deploy ist der Cache leer, und die Vorgabe von 10 Sekunden
// reichte dafür nicht — das Feld blieb dann ohne Grund leer.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!tradingConfigured()) {
    return NextResponse.json({ fehler: "Trading-Datenbank nicht verbunden." }, { status: 503 });
  }

  const q = request.nextUrl.searchParams;
  const paar = (q.get("paar") ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const seite = q.get("seite") === "short" ? "short" : "long";
  const level = Number(q.get("level"));
  const formiert = q.get("formiert");
  const teil = q.get("teil") === "lage" ? "lage" : "chart";

  if (paar.length !== 6) {
    return NextResponse.json({ fehler: "Paar fehlt." }, { status: 400 });
  }

  try {
    if (teil === "lage") {
      return NextResponse.json(await baueHitLage(paar, seite));
    }
    if (!Number.isFinite(level)) {
      return NextResponse.json({ fehler: "Level fehlt." }, { status: 400 });
    }
    return NextResponse.json(await baueHitChart(
      paar, seite, level,
      formiert && /^\d{4}-\d{2}-\d{2}$/.test(formiert) ? formiert : null,
    ));
  } catch (e) {
    console.error(`hit-detail (${teil}):`, e);
    return NextResponse.json(
      { fehler: teil === "lage" ? "Konnte die Lage nicht laden." : "Konnte den Chart nicht laden." },
      { status: 500 },
    );
  }
}
