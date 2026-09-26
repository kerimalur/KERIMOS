/**
 * Die Sprüche für den Empfang.
 *
 * Übernommen aus dem Morgen-Anstoss vom 20.08.2026 (lib/morgen.ts, seit dem
 * Umbau vom 09.09. nicht mehr im Code, im Tag `vollstand-2026-09-09`).
 *
 * Bewusst keine Zitatsammlung: „Der Weg ist das Ziel" liest man zweimal und
 * danach nie wieder. Was hier steht, bezieht sich auf Kerims eigene Regeln —
 * die GVA-Linie, den Break of Structure, das Journal, den Backtest. Ein Satz,
 * der etwas von einem WILL, überlebt die dritte Woche.
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
 * Der Spruch des Tages — durchrotiert, nicht zufällig: derselbe Tag liefert
 * immer denselben Satz, und die Liste läuft einmal ganz durch, bevor sich
 * etwas wiederholt.
 */
export function spruchFuer(datum: string, sprueche: readonly string[] = SPRUECHE): string | null {
  if (sprueche.length === 0) return null;
  const ms = Date.parse(`${datum}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const tage = Math.floor(ms / TAG_MS);
  return sprueche[((tage % sprueche.length) + sprueche.length) % sprueche.length];
}
