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
 * wo gearbeitet wird. Bei Geld und Zeit wäre der Zwischenschritt reine
 * Klickarbeit - die Kennzahlen stehen ohnehin schon auf der Kachel.
 */
export const MODE_DIRECT: Record<string, string> = {
  Geld: "/geld",
  Zeit: "/kalender?ansicht=tag",
};
