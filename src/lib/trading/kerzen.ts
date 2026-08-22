import "server-only";
import { unstable_cache } from "next/cache";
import type { Kerze } from "./zeitrahmen";

/**
 * Kerzen für den GVA-Chart im Cockpit-Popup.
 *
 * Warum es diese Datei gibt: Ein echter Screenshot vom Entstehungszeitpunkt
 * einer GVA-Linie existiert nirgends — TradingView kann Chartbilder nur aus
 * einer eingeloggten Browser-Sitzung erzeugen, nicht über eine API. Statt
 * Bilder zu speichern, wird der Chart aus den Kursdaten neu gezeichnet. Das
 * ist verlässlicher: er ist für JEDE Linie verfügbar, auch für die von vor
 * einem Jahr, und er kann nicht veralten.
 *
 * Hier steht nur das Holen. Die Gruppierung auf 3D und Woche liegt in
 * `zeitrahmen.ts` — ohne `server-only`, damit sie prüfbar bleibt.
 */

export type { Kerze, Zeitrahmen } from "./zeitrahmen";
export { zu3D, zuWoche, erkenneZeitrahmen } from "./zeitrahmen";

/**
 * Tageskerzen vom Screener-Backend.
 *
 * Gleiche Vorsichtsmassnahmen wie bei `fetchScreener`: das Backend liegt auf
 * Render und schläft ein. Hier darf der Timeout allerdings grösser sein als
 * die 2.5 s der Übersichtsseiten — dieser Aufruf passiert nur, wenn Kerim ein
 * Popup öffnet, und dort wartet er bewusst auf ein Ergebnis.
 */
const kerzenCached = unstable_cache(
  async (paar: string, seit: string): Promise<Kerze[]> => {
    const basis = (process.env.GVA_API_URL ?? "https://gva-screener.onrender.com")
      .replace(/\/+$/, "");
    const url = `${basis}/api/candles?pair=${encodeURIComponent(paar)}`
      + `&granularity=D&since=${encodeURIComponent(seit)}`;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return [];
      const json = (await res.json()) as { candles?: unknown };
      const roh = Array.isArray(json.candles) ? json.candles : [];
      return roh
        .map((c) => c as Record<string, unknown>)
        .map((c) => ({
          zeit: String(c.time ?? ""),
          open: Number(c.open), high: Number(c.high),
          low: Number(c.low), close: Number(c.close),
        }))
        .filter((k) => k.zeit !== "" && Number.isFinite(k.open) && Number.isFinite(k.close));
    } catch {
      return [];
    }
  },
  ["gva-kerzen"],
  // Historische Kerzen ändern sich nicht mehr. Eine Stunde ist trotzdem die
  // Obergrenze, damit die letzte, noch offene Kerze nicht ewig festhängt.
  { revalidate: 3600, tags: ["gva-kerzen"] },
);

export function holeTageskerzen(paar: string, seit: string): Promise<Kerze[]> {
  return kerzenCached(paar.replace(/[^A-Za-z]/g, "").toUpperCase(), seit);
}
