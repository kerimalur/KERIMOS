/**
 * Der Körper für die Gym-Analyse, als reine Daten.
 *
 * Getrennt von der Zeichenroutine, damit die Formen ohne Browser prüfbar
 * sind — und damit sie später gegen ein echtes Anatomiemodell getauscht
 * werden können, ohne dass die Seite es merkt. Die Zeichenroutine kennt nur
 * „Muskelgruppe → Netze"; woher die Netze kommen, ist ihr gleich.
 *
 * Einheiten: Meter, Füsse auf y = 0, Scheitel bei etwa y = 1.80.
 * `s` ist die Skalierung einer Einheitskugel, `p` die Mitte, `r` die Drehung
 * in Radiant. Die Gliedmassen-Bäuche sind entlang des Knochens gedreht —
 * quer zum Knochen sieht sofort falsch aus, auch für den, der es nicht
 * benennen kann.
 */

/** Neigung von Oberarm und Unterarm in der A-Pose. */
export const ARM = 0.37;
export const UARM = 0.26;

export type Teil = {
  s: [number, number, number];
  p: [number, number, number];
  r?: [number, number, number];
};

/** Zu welchem Stoff ein neutrales Teil gehört. */
export type Stoff = "grund" | "sehne";
export type NeutralTeil = Teil & { stoff: Stoff };

const L = -1, R = 1;

/**
 * Alles, was keine Muskelgruppe ist: Schädel, Rumpf, Gelenke, Unterarme,
 * Schienbeine, Füsse. Bewusst matt und dunkel — es ist Träger, nicht Aussage.
 */
export const GERUEST: NeutralTeil[] = [
  { stoff: "grund", s: [0.090, 0.112, 0.098], p: [0, 1.690, 0.004] },
  { stoff: "grund", s: [0.072, 0.062, 0.070], p: [0, 1.612, -0.020] },
  { stoff: "sehne", s: [0.050, 0.062, 0.050], p: [0, 1.545, -0.006] },
  { stoff: "grund", s: [0.170, 0.180, 0.108], p: [0, 1.318, 0] },
  { stoff: "grund", s: [0.132, 0.120, 0.090], p: [0, 1.140, 0] },
  { stoff: "grund", s: [0.162, 0.112, 0.104], p: [0, 1.010, 0] },
];

for (const s of [L, R]) {
  GERUEST.push(
    { stoff: "grund", s: [0.040, 0.115, 0.040], p: [s * 0.252, 1.272, -0.004], r: [0, 0, s * ARM] },
    { stoff: "sehne", s: [0.054, 0.054, 0.054], p: [s * 0.318, 1.148, 0.004] },
    { stoff: "grund", s: [0.047, 0.112, 0.047], p: [s * 0.362, 1.020, 0.006], r: [0, 0, s * UARM] },
    { stoff: "grund", s: [0.052, 0.062, 0.040], p: [s * 0.398, 1.008, 0.008], r: [0, 0, s * UARM] },
    { stoff: "grund", s: [0.033, 0.052, 0.024], p: [s * 0.430, 0.876, 0.008] },
    { stoff: "sehne", s: [0.060, 0.058, 0.060], p: [s * 0.104, 0.560, 0.004] },
    { stoff: "grund", s: [0.054, 0.160, 0.054], p: [s * 0.104, 0.350, 0] },
    { stoff: "sehne", s: [0.046, 0.046, 0.046], p: [s * 0.104, 0.142, 0] },
    { stoff: "grund", s: [0.056, 0.040, 0.104], p: [s * 0.104, 0.092, 0.048] },
  );
}

/**
 * Die Muskelgruppen. Die Schlüssel sind die Namen aus `muscle_groups` —
 * sie sind dort eindeutig, und eine zweite Zuordnungstabelle wäre eine
 * zweite Stelle, an der sich etwas widersprechen kann.
 *
 * Was hier NICHT steht, hat kein Körperteil: Cardio. Die Gruppe existiert
 * in der Datenbank, damit Laufen und Rudern irgendwo hingehören.
 */
export const MUSKELN: Record<string, Teil[]> = {
  // Pectoralis: zwei Platten mit Spalt am Brustbein, nach aussen oben gekippt.
  "Brust": [
    { s: [0.088, 0.062, 0.052], p: [L * 0.062, 1.352, 0.072], r: [0, 0, -0.22] },
    { s: [0.088, 0.062, 0.052], p: [R * 0.062, 1.352, 0.072], r: [0, 0, 0.22] },
    { s: [0.070, 0.042, 0.044], p: [L * 0.070, 1.288, 0.066], r: [0, 0, -0.10] },
    { s: [0.070, 0.042, 0.044], p: [R * 0.070, 1.288, 0.066], r: [0, 0, 0.10] },
  ],
  // Latissimus als V von der Achsel zur Taille, dazu der Trapez oben.
  "Rücken": [
    { s: [0.062, 0.115, 0.048], p: [L * 0.098, 1.288, -0.062], r: [0, 0, 0.30] },
    { s: [0.062, 0.115, 0.048], p: [R * 0.098, 1.288, -0.062], r: [0, 0, -0.30] },
    { s: [0.098, 0.072, 0.045], p: [0, 1.418, -0.058] },
    { s: [0.078, 0.052, 0.042], p: [L * 0.052, 1.198, -0.070] },
    { s: [0.078, 0.052, 0.042], p: [R * 0.052, 1.198, -0.070] },
  ],
  // Sechs Bauchblöcke plus die schrägen Bauchmuskeln an der Flanke.
  "Core": [
    { s: [0.040, 0.030, 0.030], p: [L * 0.042, 1.222, 0.078] },
    { s: [0.040, 0.030, 0.030], p: [R * 0.042, 1.222, 0.078] },
    { s: [0.040, 0.030, 0.030], p: [L * 0.042, 1.156, 0.080] },
    { s: [0.040, 0.030, 0.030], p: [R * 0.042, 1.156, 0.080] },
    { s: [0.040, 0.032, 0.030], p: [L * 0.042, 1.088, 0.076] },
    { s: [0.040, 0.032, 0.030], p: [R * 0.042, 1.088, 0.076] },
    { s: [0.036, 0.070, 0.040], p: [L * 0.108, 1.148, 0.048], r: [0, 0, 0.24] },
    { s: [0.036, 0.070, 0.040], p: [R * 0.108, 1.148, 0.048], r: [0, 0, -0.24] },
  ],
  // Deltoide: drei Köpfe je Seite — vorne, seitlich, hinten.
  "Schultern": [
    { s: [0.068, 0.074, 0.068], p: [L * 0.205, 1.402, 0] },
    { s: [0.068, 0.074, 0.068], p: [R * 0.205, 1.402, 0] },
    { s: [0.045, 0.048, 0.038], p: [L * 0.168, 1.396, 0.055] },
    { s: [0.045, 0.048, 0.038], p: [R * 0.168, 1.396, 0.055] },
    { s: [0.045, 0.048, 0.038], p: [L * 0.168, 1.390, -0.055] },
    { s: [0.045, 0.048, 0.038], p: [R * 0.168, 1.390, -0.055] },
  ],
  "Bizeps": [
    { s: [0.040, 0.078, 0.036], p: [L * 0.248, 1.272, 0.030], r: [0, 0, ARM] },
    { s: [0.040, 0.078, 0.036], p: [R * 0.248, 1.272, 0.030], r: [0, 0, -ARM] },
    { s: [0.030, 0.050, 0.028], p: [L * 0.288, 1.190, 0.028], r: [0, 0, ARM] },
    { s: [0.030, 0.050, 0.028], p: [R * 0.288, 1.190, 0.028], r: [0, 0, -ARM] },
  ],
  "Trizeps": [
    { s: [0.042, 0.086, 0.040], p: [L * 0.252, 1.268, -0.036], r: [0, 0, ARM] },
    { s: [0.042, 0.086, 0.040], p: [R * 0.252, 1.268, -0.036], r: [0, 0, -ARM] },
    { s: [0.030, 0.058, 0.030], p: [L * 0.222, 1.328, -0.028], r: [0, 0, ARM] },
    { s: [0.030, 0.058, 0.030], p: [R * 0.222, 1.328, -0.028], r: [0, 0, -ARM] },
  ],
  "Gesäß": [
    { s: [0.082, 0.078, 0.070], p: [L * 0.082, 0.972, -0.062] },
    { s: [0.082, 0.078, 0.070], p: [R * 0.082, 0.972, -0.062] },
  ],
  // Quadrizeps: Rectus in der Mitte, Vastus aussen und innen.
  "Quadrizeps": [
    { s: [0.040, 0.155, 0.048], p: [L * 0.098, 0.762, 0.056] },
    { s: [0.040, 0.155, 0.048], p: [R * 0.098, 0.762, 0.056] },
    { s: [0.036, 0.128, 0.046], p: [L * 0.148, 0.795, 0.030], r: [0, 0, -0.10] },
    { s: [0.036, 0.128, 0.046], p: [R * 0.148, 0.795, 0.030], r: [0, 0, 0.10] },
    { s: [0.032, 0.092, 0.042], p: [L * 0.062, 0.688, 0.048], r: [0, 0, 0.10] },
    { s: [0.032, 0.092, 0.042], p: [R * 0.062, 0.688, 0.048], r: [0, 0, -0.10] },
  ],
  "Hamstrings": [
    { s: [0.038, 0.145, 0.044], p: [L * 0.072, 0.762, -0.058] },
    { s: [0.038, 0.145, 0.044], p: [R * 0.072, 0.762, -0.058] },
    { s: [0.036, 0.140, 0.042], p: [L * 0.132, 0.762, -0.050] },
    { s: [0.036, 0.140, 0.042], p: [R * 0.132, 0.762, -0.050] },
  ],
  // Gastrocnemius: zwei Köpfe, oben breit, unten in die Achillessehne.
  "Waden": [
    { s: [0.038, 0.082, 0.040], p: [L * 0.080, 0.418, -0.032] },
    { s: [0.038, 0.082, 0.040], p: [R * 0.080, 0.418, -0.032] },
    { s: [0.036, 0.076, 0.038], p: [L * 0.124, 0.412, -0.030] },
    { s: [0.036, 0.076, 0.038], p: [R * 0.124, 0.412, -0.030] },
  ],
};

/** Gruppen, die am Modell vorkommen — in fester Reihenfolge. */
export const AM_KOERPER = Object.keys(MUSKELN);

/** Blick von vorne oder hinten, aus dem Drehwinkel. */
export function ansichtName(drehungY: number): string {
  const g = (((drehungY * 180) / Math.PI) % 360 + 360) % 360;
  if (g < 45 || g >= 315) return "Vorne";
  if (g < 135) return "Seite links";
  if (g < 225) return "Hinten";
  return "Seite rechts";
}
