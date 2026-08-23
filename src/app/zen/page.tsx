import { ZenUhr } from "@/components/zen-uhr";

/**
 * Zen — eine Seite, auf der nichts passiert.
 *
 * Ersatz für die Fokus-Sitzungen. Die haben nach jeder Sitzung gefragt, was
 * man gemacht hat, wie lange, in welchem Bereich — und liefen damit auf
 * dieselbe Erfassung hinaus, die abgeschafft wurde. Am Ende standen offene
 * Sitzungen von vorgestern auf der Startseite und wollten beantwortet werden.
 *
 * Was übrig bleibt, ist das, wofür man sie eigentlich benutzt hat: eine Uhr,
 * die läuft, und ein Bildschirm ohne Ablenkung. Nichts wird gespeichert, es
 * gibt nichts nachzutragen. Wer wissen will, was aus dem Tag geworden ist,
 * schreibt abends drei Zeilen in den Rückblick.
 */
export default function ZenSeite() {
  return <ZenUhr />;
}
