import { hatInhalt, type Rueckblick } from "./tagesrueckblick";

/**
 * Der Morgen-Anstoss: was gestern liegengeblieben ist, und was heute zählt.
 *
 * Der Tagesrückblick fragt abends drei Dinge, und zwei davon sind am nächsten
 * Morgen noch relevant: was liegengeblieben ist und was man sich vorgenommen
 * hat. Genau diese zwei Zeilen gehen morgens zurück — nicht der ganze
 * Rückblick, und ausdrücklich nicht das Erreichte. Das war gestern.
 *
 * Warum überhaupt: ein Vorsatz, den man abends aufschreibt und morgens nicht
 * mehr sieht, ist ein Eintrag in einer Datenbank und keine Absicht.
 *
 * Zwei getrennte Nachrichten, nicht eine: die Vorsätze sind eine Aufgabe, die
 * Motivation ist eine Haltung. Zusammen in einem Block liest man das eine und
 * überliest das andere.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/morgen.mts`.
 */

export interface MorgenNachricht {
  titel: string;
  text: string;
  /** True, wenn es nichts zu erinnern gibt — dann wird nicht gesendet. */
  leer: boolean;
}

/** Länge, ab der eine Zeile in der Nachricht gekürzt wird. */
export const MAX_ZEILE = 220;

const kurz = (t: string): string => {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > MAX_ZEILE ? `${s.slice(0, MAX_ZEILE - 1)}…` : s;
};

/**
 * Die Erinnerung an die eigenen Vorsätze.
 *
 * Leer, wenn gestern beide Felder leer waren. Bewusst KEINE Ersatzmeldung
 * („du hast gestern nichts eingetragen") — das wäre eine Ermahnung dafür, an
 * einem müden Abend nichts geschrieben zu haben, und genau davon wird der
 * Rückblick nicht zuverlässiger. Die Abenderinnerung ist der richtige Ort für
 * dieses Thema, nicht der Morgen.
 */
export function baueMorgenNachricht(gestern: Rueckblick | null): MorgenNachricht {
  if (!gestern || !hatInhalt(gestern)) {
    return { titel: "Guten Morgen", text: "", leer: true };
  }

  const offen = gestern.liegengeblieben.trim();
  const wichtig = gestern.morgen.trim();
  if (!offen && !wichtig) {
    return { titel: "Guten Morgen", text: "", leer: true };
  }

  const zeilen: string[] = [];
  if (wichtig) zeilen.push(`Heute das Wichtigste: ${kurz(wichtig)}`);
  if (offen) zeilen.push(`Gestern liegengeblieben: ${kurz(offen)}`);

  return {
    titel: wichtig ? "Das hast du dir vorgenommen" : "Von gestern offen",
    text: zeilen.join("\n\n"),
    leer: false,
  };
}

/* ------------------------------------------------------------- Motivation */

/**
 * Die Sprüche.
 *
 * Bewusst keine Zitatsammlung: „Der Weg ist das Ziel" liest man zweimal und
 * danach nie wieder. Was hier steht, bezieht sich auf Kerims eigene Regeln —
 * die GVA-Linie, den Break of Structure über dem Daily Open, das Journal, den
 * Backtest. Ein Satz, der etwas von einem WILL, überlebt die dritte Woche;
 * ein Satz, der einen nur lobt, nicht.
 *
 * Ein paar davon sind unbequem. Das ist der Punkt.
 */
export const SPRUECHE: readonly string[] = [
  "Ein Setup, das du erklären kannst, ist ein Setup. Alles andere ist eine Meinung mit Hebel.",
  "Kein Break of Structure, kein Einstieg. Die Linie allein ist nur eine Linie.",
  "Der teuerste Trade ist der, den du nimmst, weil du heute noch keinen hattest.",
  "Trag ihn ins Journal, solange du dich noch erinnerst, warum du drin warst.",
  "Sechs Backtest-Trades heute sind mehr wert als sechs Stunden Charts anschauen.",
  "Wenn du den Stop verschiebst, hattest du keinen Stop, sondern eine Hoffnung.",
  "Die Fundamentallage ist ein Filter, kein Einstieg. Sie sagt dir, wo du nicht suchen musst.",
  "Warten ist eine Position. Sie kostet nichts und geht nie gegen dich.",
  "Ein Tag ohne Trade ist kein verlorener Tag. Ein Tag mit einem schlechten Trade schon.",
  "Was du nicht aufschreibst, wiederholst du.",
  "Dein Vorteil liegt nicht darin, mehr zu sehen — sondern darin, weniger zu nehmen.",
  "Wenn du das Setup dem Chart erklären musst, ist es keins.",
  "Zwei Verlusttrades hintereinander sind Statistik. Der dritte aus Trotz ist eine Entscheidung.",
  "Prüf den Plan, bevor der Markt öffnet. Danach prüfst du nur noch dich selbst.",
  "Die Kerze ist noch nicht zu. Also weisst du es noch nicht.",
  "Grösse anpassen ist keine Schwäche. Grösse aus Langeweile erhöhen schon.",
  "Der Backtest sagt dir, was funktioniert hat. Die Disziplin sagt dir, ob du es je benutzen wirst.",
  "Ein Setup verpasst zu haben kostet dich nichts. Es hinterherzujagen schon.",
  "Schreib vor dem Einstieg auf, wann du falsch liegst. Danach willst du es nicht mehr wissen.",
  "Der Markt läuft morgen weiter. Dein Konto vielleicht nicht.",
  "Wenn du gerade sicher bist: an welcher Stelle wärst du bereit, das aufzugeben?",
  "Gute Wochen entstehen aus langweiligen Tagen.",
  "Du handelst deinen Plan oder du handelst deine Stimmung. Etwas Drittes gibt es nicht.",
  "Miss dich am Prozess. Das Ergebnis kommt aus einer Stichprobe, die du noch gar nicht hast.",
];

const TAG_MS = 86_400_000;

/**
 * Der Spruch des Tages — durchrotiert, nicht zufällig.
 *
 * `Math.random()` wäre hier falsch: derselbe Tag muss bei einem zweiten Aufruf
 * denselben Satz liefern (der Cron kann doppelt feuern, ein Probelauf soll
 * zeigen, was rausgeht), und Zufall wiederholt sich an aufeinanderfolgenden
 * Tagen. Über das Datum gerechnet läuft die Liste einmal komplett durch,
 * bevor sich etwas wiederholt.
 *
 * Null bei unlesbarem Datum — der Aufrufer schickt dann nichts, statt eine
 * Nachricht mit „undefined" zu verschicken.
 */
export function motivationFuer(
  datum: string, sprueche: readonly string[] = SPRUECHE,
): string | null {
  if (sprueche.length === 0) return null;
  const ms = Date.parse(`${datum}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const tage = Math.floor(ms / TAG_MS);
  return sprueche[((tage % sprueche.length) + sprueche.length) % sprueche.length];
}
