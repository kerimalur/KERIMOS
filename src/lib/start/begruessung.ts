/**
 * Was der Kompass beim Start sagt.
 *
 * Kerims Wunsch: „es heisst mich herzlich willkommen oder sagt mir etwas,
 * was wichtig ist." Beides — eine Anrede nach Tageszeit und EIN Satz, der
 * heute tatsächlich zählt.
 *
 * Die Regel für den zweiten Satz: er nennt immer nur die dringendste Sache.
 * Eine Liste mit vier Zahlen ist keine Begrüssung, sondern ein Bericht, und
 * Berichte liest man nicht beim Reinkommen. Steht nichts an, sagt er das
 * auch — „nichts offen" ist eine gute Nachricht und keine leere Zeile.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/start.mts`.
 */

export interface Lage {
  /** Stunde 0…23 in Kerims Zeitzone. */
  stunde: number;
  /** Wochentag, 0 = Sonntag. */
  wochentag: number;
  /** GVA-Hits, die auf eine Entscheidung warten. */
  hits: number;
  /** Trades, die gerade laufen. */
  laufende: number;
  /** Trades ohne Ausgang, die älter als heute sind — die vergessenen. */
  unvollstaendig: number;
}

export interface Ansage {
  gruss: string;
  satz: string;
  /** Wohin der Satz führt, falls er zu etwas führt. */
  ziel: string | null;
  zielText: string | null;
}

export function anrede(stunde: number): string {
  if (stunde < 5) return "Noch wach";
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 14) return "Mittag";
  if (stunde < 18) return "Guten Nachmittag";
  if (stunde < 22) return "Guten Abend";
  return "Späte Runde";
}

export function begruessung(l: Lage, name = "Kerim"): Ansage {
  const gruss = `${anrede(l.stunde)}, ${name}.`;

  // Reihenfolge = Dringlichkeit. Das Erste, was zutrifft, gewinnt.
  if (l.hits > 0) {
    return {
      gruss,
      satz: l.hits === 1
        ? "Ein GVA-Hit wartet auf eine Entscheidung."
        : `${l.hits} GVA-Hits warten auf eine Entscheidung.`,
      ziel: "/trading/cockpit",
      zielText: "Ins Cockpit",
    };
  }

  if (l.unvollstaendig > 0) {
    return {
      gruss,
      satz: l.unvollstaendig === 1
        ? "Ein abgeschlossener Trade hat noch keinen Eintrag im Journal."
        : `${l.unvollstaendig} abgeschlossene Trades haben noch keinen Eintrag im Journal.`,
      ziel: "/trading/journal/trades",
      zielText: "Nachtragen",
    };
  }

  if (l.laufende > 0) {
    return {
      gruss,
      satz: l.laufende === 1
        ? "Ein Trade läuft. Sonst ist nichts offen."
        : `${l.laufende} Trades laufen. Sonst ist nichts offen.`,
      ziel: "/trading",
      zielText: "Ansehen",
    };
  }

  // Wochenende ohne offene Punkte: das ist der Moment fürs Backtesten, nicht
  // für eine leere Seite.
  if (l.wochentag === 0 || l.wochentag === 6) {
    return {
      gruss,
      satz: "Kein Trade offen, keine Entscheidung fällig. Gute Zeit zum Backtesten.",
      ziel: "/trading/backtest",
      zielText: "Backtest",
    };
  }

  return {
    gruss,
    satz: "Nichts offen. Der Markt läuft, du musst nichts tun.",
    ziel: null,
    zielText: null,
  };
}
