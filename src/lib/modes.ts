/**
 * Modi = Kachel-Gruppen. Die Startseite zeigt einen grossen Einstieg pro
 * Gruppe ("Wo willst du arbeiten?"), /m/[gruppe] ist der Arbeitsplatz dazu.
 * Neue Modi entstehen einfach dadurch, dass eine Kachel unter /links eine
 * neue Gruppe bekommt — hier steht nur die bevorzugte Reihenfolge.
 */
/**
 * "Geld" ist am 21.08.2026 ersatzlos raus — Kerim fuehrt seine Finanzen nicht
 * mehr hier. Die Kachel wird auf der Startseite ausgeblendet, statt die
 * `links`-Zeilen zu loeschen: so bleibt der Bestand unangetastet, falls es
 * doch je zurueckkommt.
 */
export const MODE_ORDER = [
  "Traden", "Gym", "Essen", "Zeit", "Lernen",
];

/** Gruppen, die auf der Startseite nicht mehr auftauchen. */
export const MODE_AUS = new Set(["Geld"]);

/**
 * Modi, die keinen eigenen Arbeitsplatz brauchen: sie führen direkt dorthin,
 * wo gearbeitet wird. Der Zwischenschritt über /m/[gruppe] wäre reine
 * Klickarbeit - die Kennzahlen stehen ohnehin schon auf der Kachel.
 *
 * Gym und Essen laufen inzwischen vollständig in KerimOS. Die alten
 * eigenständigen Apps sind Altbestand und werden nicht mehr angesteuert -
 * deshalb führen beide Kacheln direkt in ihren Bereich.
 */
export const MODE_DIRECT: Record<string, string> = {
  Zeit: "/termine",
  Gym: "/gym",
  Essen: "/m/Essen",
  // Traden führt direkt aufs GVA-Board. TradingView und der Screener sind
  // von dort aus verlinkt - der Umweg über die Kachelseite war ein Klick
  // ohne Gegenwert.
  Traden: "/trading",
};
