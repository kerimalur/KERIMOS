import "server-only";
import { createTradingClient, fetchWatchlist, fetchScreener } from "@/lib/supabase/trading";
import type { ScreenerPair } from "@/lib/supabase/trading";
import type { Alarmart } from "./regeln";

/**
 * Was demnächst eine Nachricht auslöst — und was schon eine ausgelöst hat.
 *
 * Kerims Wunsch vom 27.08.2026, und ein berechtigter: die Alarme waren bis
 * dahin unsichtbar. Man sah erst, dass eine Linie meldet, wenn sie meldete.
 * Seit die Sperre endgültig ist, kommt eine zweite Frage dazu — *hat die hier
 * schon gefeuert?* —, und die konnte man vorher gar nicht stellen.
 *
 * Stummschalten heisst hier: eine Sperrzeile schreiben. Es ist derselbe
 * Mechanismus, der nach dem Versand greift, nur von Hand ausgelöst. Ein
 * zweiter Weg mit einer eigenen Spalte „stumm" wäre eine zweite Wahrheit
 * darüber, ob etwas rausgeht.
 */

/** Pip-Grösse: JPY-Paare rechnen mit 0.01, alles andere mit 0.0001. */
const pipGroesse = (pair: string) =>
  pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;

export interface AlarmZeile {
  id: string;
  pair: string;
  side: string | null;
  level: number | null;
  /** Live-Preis, wenn der Screener einen liefert. */
  preis: number | null;
  /** Abstand in Pips. Null ohne Preis oder ohne Linie. */
  pips: number | null;
  bereitsGetroffen: boolean;
  zeit: string | null;
  /** Welche Arten für diese Zeile eingeschaltet sind. */
  arten: Alarmart[];
  /** Art → Tag, an dem sie gemeldet wurde. Leer heisst: noch scharf. */
  gemeldet: Partial<Record<Alarmart, string>>;
  note: string | null;
}

export async function ladeAlarmUebersicht(): Promise<AlarmZeile[]> {
  const [linien, screener] = await Promise.all([fetchWatchlist(), fetchScreener()]);

  const mitAlarm = linien.filter((l) => l.alarm_on_hit || l.alarm_time !== null);
  if (mitAlarm.length === 0) return [];

  const preise = new Map<string, number>();
  for (const p of (screener?.data ?? []) as ScreenerPair[]) {
    if (typeof p.price === "number") preise.set(p.pair.toUpperCase(), p.price);
  }

  // Die Sperrzeilen in EINER Abfrage, nicht je Linie. Bei zwanzig
  // Beobachtungen wären das sonst zwanzig Runden zur Datenbank.
  const gemeldetJeLinie = new Map<string, Partial<Record<Alarmart, string>>>();
  const db = createTradingClient();
  if (db) {
    const { data } = await db.from("alarm_log")
      .select("watchlist_id, art, tag")
      .in("watchlist_id", mitAlarm.map((l) => l.id));
    for (const z of (data ?? []) as { watchlist_id: string; art: string; tag: string }[]) {
      const eintrag = gemeldetJeLinie.get(z.watchlist_id) ?? {};
      eintrag[z.art as Alarmart] = z.tag;
      gemeldetJeLinie.set(z.watchlist_id, eintrag);
    }
  }

  return mitAlarm.map((l) => {
    const preis = preise.get(l.pair.toUpperCase()) ?? null;
    const level = l.line_level === null ? null : Number(l.line_level);
    const pips = preis === null || level === null
      ? null : Math.abs(preis - level) / pipGroesse(l.pair);

    const arten: Alarmart[] = [];
    if (l.alarm_on_hit) arten.push("hit");
    if (l.alarm_time) arten.push("zeit");

    return {
      id: l.id, pair: l.pair, side: l.side, level, preis, pips,
      // Ohne Seite gilt „praktisch drauf" als Treffer — dieselbe Regel wie
      // im Cron, sonst zeigt die Übersicht etwas anderes an, als passiert.
      bereitsGetroffen: preis === null || level === null ? false
        : l.side === "long" ? preis <= level
          : l.side === "short" ? preis >= level
            : (pips ?? 99) < 1,
      zeit: l.alarm_time?.slice(0, 5) ?? null,
      arten,
      gemeldet: gemeldetJeLinie.get(l.id) ?? {},
      note: l.note ?? null,
    };
  }).sort((a, b) =>
    // Was am nächsten dran ist, steht oben — danach sucht man hier.
    (a.pips ?? 1e9) - (b.pips ?? 1e9) || a.pair.localeCompare(b.pair));
}
