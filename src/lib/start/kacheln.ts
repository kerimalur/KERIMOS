/**
 * Die Kacheln der Startseite — Inhalt und Platz auf der Collage.
 *
 * Kerims Idee vom 26.09.2026: die Startseite IST das Bild. Jede Kachel ist
 * ein Ausschnitt daraus, umrandet und anklickbar, und führt entweder in
 * einen Bereich der App oder nach draussen (Google Kalender, TradingView).
 *
 * Warum die Ausschnitte hier als Zahlen stehen und nicht als einzelne
 * Bilddateien: die Collage ist EIN Bild. Sie in vierzehn Dateien zu
 * zerschneiden hiesse, bei jedem Austausch vierzehnmal zu schneiden. So
 * liegt eine Datei in `public/`, und diese Tabelle sagt, welcher Teil davon
 * wo hingehört. Ein neues Bild heisst: Datei ersetzen, Zahlen anpassen.
 *
 * Die Zahlen sind Prozent der Collage, gemessen an ihren Nähten
 * (Spalten bei 17.0 / 35.5 / 58.0 / 80.8). Wer das Bild tauscht, misst neu.
 *
 * `art` entscheidet, was ein Klick macht:
 *   intern  Link innerhalb von KerimOS
 *   extern  Webseite, neuer Tab
 *   app     lokal installierte Anwendung über ihr eigenes Protokoll.
 *           Reagiert sie nicht, öffnet nach kurzer Zeit `ersatz`.
 *   frei    noch nicht vergeben — sichtbar, aber nicht anklickbar
 */

export type KachelArt = "intern" | "extern" | "app" | "frei";

export interface Kachel {
  id: string;
  name: string;
  unterzeile: string;
  ziel: string;
  art: KachelArt;
  /** Fallback für `app`, wenn das Protokoll ins Leere läuft. */
  ersatz?: string;
  /** Ausschnitt der Collage, in Prozent: linke Kante, obere Kante, Breite, Höhe. */
  x: number; y: number; w: number; h: number;
}

export const BRETT_BILD = "/kompass-board.jpg";

/** Seitenverhältnis der Collage — hält die Ausschnitte an ihrem Platz. */
export const BRETT_VERHAELTNIS = "5 / 4";

/*
 * Die vierzehn Felder decken die Collage LÜCKENLOS ab: fünf Spalten
 * (0–17, 17–35.5, 35.5–58, 58–80.8, 80.8–100 — die gemessenen Nähte des
 * Bildes), und in jeder Spalte summieren sich die Höhen auf 100.
 *
 * Das ist der Unterschied zur ersten Fassung vom Vormittag: dort sassen die
 * Felder nur auf den Fotos und liessen die dunklen Zwischenräume der Collage
 * frei. Das sah aus wie ein halbleeres Brett. Jetzt schlucken die
 * Nachbarfelder diese Ränder — der dunkle Streifen über dem Gym-Foto gehört
 * zum Cockpit, die dunkle Fläche oben in Spalte 4 ist ein eigenes Feld. Die
 * einzige Fuge ist die 3px Polsterung zwischen den Kacheln.
 */
export const KACHELN: Kachel[] = [
  /* ── Spalte 1 (0–17) ────────────────────────────────────────────────── */
  { id: "vantage", name: "Vantage", unterzeile: "Broker", art: "extern",
    ziel: "https://www.vantagemarkets.com/", x: 0, y: 0, w: 17, h: 50.7 },
  { id: "essen", name: "Essen", unterzeile: "Plan & Einkauf", art: "intern",
    ziel: "/m/Essen", x: 0, y: 50.7, w: 17, h: 15.1 },
  { id: "kalender", name: "Kalender", unterzeile: "Google", art: "extern",
    ziel: "https://calendar.google.com/calendar/r", x: 0, y: 65.8, w: 17, h: 34.2 },

  /* ── Spalte 2 (17–35.5) ─────────────────────────────────────────────── */
  { id: "trades", name: "Aktive Trades", unterzeile: "Was gerade läuft", art: "intern",
    ziel: "/trading", x: 17, y: 0, w: 18.5, h: 35.1 },
  { id: "tradingview", name: "TradingView", unterzeile: "Öffnet die App", art: "app",
    ziel: "tradingview://", ersatz: "https://www.tradingview.com/chart/",
    x: 17, y: 35.1, w: 18.5, h: 24.4 },
  { id: "backtest", name: "Backtest", unterzeile: "Üben und auswerten", art: "intern",
    ziel: "/trading/backtest", x: 17, y: 59.5, w: 18.5, h: 40.5 },

  /* ── Spalte 3 (35.5–58) — das grösste Feld, was am häufigsten aufgeht ── */
  { id: "cockpit", name: "Cockpit", unterzeile: "GVA-Hits", art: "intern",
    ziel: "/trading/cockpit", x: 35.5, y: 0, w: 22.5, h: 61.5 },
  { id: "journal", name: "Journal", unterzeile: "Trades & Konto", art: "intern",
    ziel: "/trading/journal", x: 35.5, y: 61.5, w: 22.5, h: 38.5 },

  /* ── Spalte 4 (58–80.8) ─────────────────────────────────────────────── */
  { id: "wirtschaftskalender", name: "Wirtschaftskalender", unterzeile: "Forex Factory",
    art: "extern", ziel: "https://www.forexfactory.com/calendar",
    x: 58, y: 0, w: 22.8, h: 23 },
  { id: "fundamentals", name: "Fundamentals", unterzeile: "Drei Ebenen", art: "intern",
    ziel: "/trading/fundamentals", x: 58, y: 23, w: 22.8, h: 38.5 },
  { id: "alarme", name: "Alarme", unterzeile: "Push & Telegram", art: "intern",
    ziel: "/trading/einstellungen", x: 58, y: 61.5, w: 22.8, h: 38.5 },

  /* ── Spalte 5 (80.8–100) ────────────────────────────────────────────── */
  { id: "waehrungen", name: "Währungen", unterzeile: "Einzeln, ungepaart", art: "intern",
    ziel: "/trading/waehrungen", x: 80.8, y: 0, w: 19.2, h: 50.7 },
  { id: "frei-1", name: "frei", unterzeile: "sag mir, was hier hin soll", art: "frei",
    ziel: "", x: 80.8, y: 50.7, w: 19.2, h: 19.3 },
  { id: "frei-2", name: "frei", unterzeile: "sag mir, was hier hin soll", art: "frei",
    ziel: "", x: 80.8, y: 70, w: 19.2, h: 30 },
];

/**
 * Die Sprite-Rechnung für einen Ausschnitt.
 *
 * `background-position` in Prozent heisst NICHT „verschiebe um x %", sondern
 * „lege den Punkt bei x % des Bildes auf den Punkt bei x % des Rahmens".
 * Deshalb der Nenner (100 − w): ohne ihn sitzt jeder Ausschnitt ausser dem
 * ganz linken falsch, und zwar umso mehr, je weiter rechts er liegt. Genau
 * dieser Fehler lässt eine Collage „fast richtig" aussehen.
 */
export function ausschnitt(k: Kachel): React.CSSProperties {
  return {
    backgroundImage: `url(${BRETT_BILD})`,
    backgroundSize: `${(100 / k.w) * 100}% ${(100 / k.h) * 100}%`,
    backgroundPosition:
      `${k.w >= 100 ? 50 : (k.x / (100 - k.w)) * 100}% `
      + `${k.h >= 100 ? 50 : (k.y / (100 - k.h)) * 100}%`,
  };
}

/**
 * Derselbe Ausschnitt für schmale Bildschirme.
 *
 * Auf dem Handy gibt es kein Brett im Bildformat der Collage — dort stehen
 * die Kacheln als zweispaltige Liste, jede in ihrem eigenen Format. Ein
 * exakter Ausschnitt ginge da nicht auf, deshalb nur die Mitte des Feldes
 * und `cover`: es zeigt ungefähr dasselbe Motiv, nur anders beschnitten.
 */
export function ausschnittMobil(k: Kachel): React.CSSProperties {
  return {
    backgroundImage: `url(${BRETT_BILD})`,
    backgroundSize: "cover",
    backgroundPosition: `${k.x + k.w / 2}% ${k.y + k.h / 2}%`,
  };
}
