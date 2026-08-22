/**
 * Aus „Was ist morgen das Wichtigste?" werden abhakbare Punkte.
 *
 * Kerim schreibt mal drei Zeilen, mal einen Satz. Zerlegt wird nur an
 * Zeilenumbrüchen und an Aufzählungszeichen — **nicht an Kommas**:
 * „Chart durchgehen, dann Journal" ist EIN Vorsatz und nicht zwei. Ein
 * Komma-Trenner würde aus einem Satz drei halbe Aufgaben machen, die keinen
 * Sinn mehr ergeben und die man auch nicht abhaken will.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar in `tools/checks/heute.mts`.
 */
export function zuPunkten(text: string): string[] {
  return text
    .split(/\r?\n/)
    // Aufzählungszeichen und Nummerierung weg — sie gehören zur Schreibweise,
    // nicht zum Inhalt. Sonst hinge der Haken an „1. " statt an der Aufgabe.
    .map((z) => z.replace(/^\s*[-–—*•]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((z) => z.length > 0)
    // Doppelte Zeilen zusammenfassen: der Haken haengt am TEXT, zwei gleiche
    // Zeilen waeren zwei Kaestchen, die immer gemeinsam umspringen.
    .filter((z, i, alle) => alle.indexOf(z) === i);
}
