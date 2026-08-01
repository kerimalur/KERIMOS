/**
 * Modi = Kachel-Gruppen. Die Startseite zeigt einen grossen Einstieg pro
 * Gruppe ("Wo willst du arbeiten?"), /m/[gruppe] ist der Arbeitsplatz dazu.
 * Neue Modi entstehen einfach dadurch, dass eine Kachel unter /links eine
 * neue Gruppe bekommt — hier steht nur die bevorzugte Reihenfolge.
 */
export const MODE_ORDER = [
  "Traden", "Programmieren", "Gym", "Essen", "Geld", "Zeit", "Lernen",
];

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
  Geld: "/geld",
  Zeit: "/kalender?ansicht=tag",
  Gym: "/gym",
  Essen: "/m/Essen",
};
