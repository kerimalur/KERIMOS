// Kontrollwerte für die eigene Watchlist ("Beobachtung").
// Aufruf:  npx -y tsx tools/checks/beobachtung.mts
//
// Die Karte fasst zwei Quellen zusammen, und genau dort entstehen die Fehler,
// die man auf einer Seite nicht sieht: ein Paar, das in beiden steht, taucht
// doppelt auf; eine GVA-Linie rutscht in die Beobachtungsliste; die
// Reihenfolge stellt das Unwichtige nach oben. Alle drei sind hier abgedeckt.
import { baueBeobachtung } from "../../src/lib/trading/beobachtung";
import type { ScreenerPair, WatchlistPair } from "../../src/lib/supabase/trading";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const sp = (pair: string, o: Partial<ScreenerPair> = {}): ScreenerPair => ({
  pair, near: null, price: 1.1, short: null, long: null,
  short_tf: null, long_tf: null, status: "NEUTRAL", distance: null,
  stale: false, pending: false, ...o,
});

const wl = (pair: string, o: Partial<WatchlistPair> = {}): WatchlistPair => ({
  id: `id-${pair}`, pair, note: null, created_at: "2026-08-01",
  line_level: null, side: null, alarm_pips: null, alarm_on_hit: false,
  alarm_time: null, show_until: null, archived: false, ...o,
});

// --- Quellen und Gründe --------------------------------------------------
{
  const z = baueBeobachtung(
    [sp("EURUSD", { pending: true }), sp("GBPUSD"), sp("AUDUSD", { pending: true })],
    [wl("USDJPY"), wl("AUDUSD")],
  );
  check("nur markierte und eingetragene Paare", z.map((x) => x.pair).sort(),
    ["AUDUSD", "EURUSD", "USDJPY"]);
  check("Paar in beiden Quellen -> einmal", z.filter((x) => x.pair === "AUDUSD").length, 1);
  check("Paar in beiden Quellen -> Grund", z.find((x) => x.pair === "AUDUSD")?.grund, "beides");
  check("nur Radar -> setup", z.find((x) => x.pair === "EURUSD")?.grund, "setup");
  check("nur eingetragen -> manuell", z.find((x) => x.pair === "USDJPY")?.grund, "manuell");
}

// --- Eine Linie ist keine Beobachtung ------------------------------------
// Zeilen MIT Level sind GVA-Linien und stehen in der Karte darüber. Stünden
// sie auch hier, hätte man dieselbe Linie zweimal auf der Seite.
{
  const z = baueBeobachtung([], [wl("EURUSD", { line_level: 1.09 }), wl("GBPUSD")]);
  check("Zeile mit Level faellt raus", z.map((x) => x.pair), ["GBPUSD"]);
}

// --- Archiviertes bleibt draussen ----------------------------------------
{
  const z = baueBeobachtung([], [wl("EURUSD", { archived: true }), wl("GBPUSD")]);
  check("archiviert faellt raus", z.map((x) => x.pair), ["GBPUSD"]);
}

// --- Reihenfolge ---------------------------------------------------------
// Getroffen vor nah dran vor Rest; innerhalb der Stufe der kleinere Abstand.
{
  const z = baueBeobachtung([
    sp("AAAAAA", { pending: true, status: "NEUTRAL", distance: 5 }),
    sp("BBBBBB", { pending: true, status: "PREPARE", distance: 80 }),
    sp("CCCCCC", { pending: true, status: "HIT", distance: 0 }),
    sp("DDDDDD", { pending: true, status: "PREPARE", distance: 12 }),
  ], []);
  check("Stufen vor Abstand", z.map((x) => x.pair),
    ["CCCCCC", "DDDDDD", "BBBBBB", "AAAAAA"]);
}

// --- Kein Screener-Eintrag -----------------------------------------------
// Ein von Hand eingetragenes Paar, das der Screener nicht kennt, darf nicht
// mit einem erfundenen Abstand nach oben rutschen.
{
  const z = baueBeobachtung(
    [sp("EURUSD", { pending: true, status: "PREPARE", distance: 40 })],
    [wl("XAUUSD")],
  );
  check("unbekanntes Paar steht unten", z.map((x) => x.pair), ["EURUSD", "XAUUSD"]);
  check("unbekanntes Paar ohne Preis", z.find((x) => x.pair === "XAUUSD")?.preis, null);
  check("unbekanntes Paar ohne Status", z.find((x) => x.pair === "XAUUSD")?.status, null);
}

// --- Schreibweise --------------------------------------------------------
// "eurusd" von Hand und "EURUSD" aus dem Screener sind dasselbe Paar.
{
  const z = baueBeobachtung([sp("EURUSD", { pending: true })], [wl("eurusd")]);
  check("Gross-/Kleinschreibung -> ein Eintrag", z.length, 1);
  check("Gross-/Kleinschreibung -> Grund", z[0].grund, "beides");
}

// --- Notiz und Entfernen-Griff -------------------------------------------
{
  const z = baueBeobachtung([], [wl("EURUSD", { note: "Range-Oberkante" })]);
  check("Notiz kommt durch", z[0].notiz, "Range-Oberkante");
  check("id fuer Entfernen da", z[0].watchlistId, "id-EURUSD");
}
{
  const z = baueBeobachtung([sp("EURUSD", { pending: true })], []);
  check("nur Radar -> keine id zum Entfernen", z[0].watchlistId, null);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
