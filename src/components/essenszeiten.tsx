import { Card, CardTitle } from "@/components/ui";

/**
 * Die Essenszeiten je Diensttyp.
 *
 * Steht bewusst als feste Information hier und nicht in einer Datenbank:
 * Es sind vier Muster, die sich aus den Schichtzeiten ergeben und sich nur
 * ändern, wenn sich der Arbeitsrhythmus ändert. Eine Tabelle dafür wäre
 * Aufwand ohne Gewinn.
 *
 * Die Uhrzeiten sind kein Dogma - entscheidend ist der Abstand zum Training.
 * Feste Mahlzeit braucht 1,5 bis 2 Stunden Vorlauf, flüssig reichen 45 Minuten.
 *
 * Beim Frühtraining wird nüchtern trainiert, nur Kaffee davor. Der Shake
 * kommt danach - vor der Schicht bleibt gar keine Zeit für Verdauung, und
 * bei einer Einheit unter einer Stunde bringt das Essen davor ohnehin nichts.
 *
 * Zwei Proteinpulver, klar getrennt: Casein ins Porridge und in den Quark,
 * Whey ausschliesslich in den Post-Workout-Shake. Und den gibt es nur an
 * Arbeitstagen nach dem Frühtraining - an freien Tagen wird vorher gegessen.
 */

interface Tagesmuster {
  titel: string;
  hinweis: string;
  zeiten: { uhr: string; was: string; betont?: boolean }[];
}

const MUSTER: Tagesmuster[] = [
  {
    titel: "Freier Tag · Training 08:30",
    hinweis: "Eineinhalb Stunden Vorlauf — hier funktioniert festes Essen.",
    zeiten: [
      { uhr: "06:45", was: "Porridge mit Casein", betont: true },
      { uhr: "08:30", was: "Training — kein Shake danach" },
      { uhr: "12:00", was: "Hauptmahlzeit" },
      { uhr: "15:30", was: "Magerquark mit Blaubeeren" },
      { uhr: "18:30", was: "Hauptmahlzeit" },
    ],
  },
  {
    titel: "Arbeitstag · Training 07:30 vor der Schicht",
    hinweis: "Nüchtern trainieren, nur Kaffee. Der Shake kommt danach.",
    zeiten: [
      { uhr: "07:00", was: "Kaffee, sonst nichts" },
      { uhr: "07:30", was: "Training nüchtern" },
      { uhr: "08:30", was: "Post-Workout Shake mit Whey", betont: true },
      { uhr: "08:45", was: "Schichtbeginn" },
      { uhr: "11:00", was: "Meal-Prep-Box" },
      { uhr: "15:30", was: "Magerquark mit Blaubeeren" },
      { uhr: "17:00", was: "Letzte Mahlzeit" },
    ],
  },
  {
    titel: "Arbeitstag · Training 14:30 in der Zimmerstunde",
    hinweis: "Das Mittagessen um 11:00 trägt bis dahin nicht — Brücke nötig.",
    zeiten: [
      { uhr: "06:30", was: "Porridge mit Casein" },
      { uhr: "11:00", was: "Meal-Prep-Box" },
      { uhr: "13:45", was: "Whey-Shake mit Banane als Brücke", betont: true },
      { uhr: "14:30", was: "Training" },
      { uhr: "17:00", was: "Letzte Mahlzeit" },
    ],
  },
  {
    titel: "Durchdienst 09–18 · Training 20:00",
    hinweis: "Erste Mahlzeit erst um 11:00, dafür eine nach dem Training.",
    zeiten: [
      { uhr: "11:00", was: "Meal-Prep-Box — erste Mahlzeit des Tages" },
      { uhr: "15:30", was: "Magerquark mit Blaubeeren" },
      { uhr: "18:30", was: "Porridge mit Casein — Pre-Workout", betont: true },
      { uhr: "20:00", was: "Training" },
      { uhr: "21:30", was: "Hauptmahlzeit, fettarm — kein Shake", betont: true },
    ],
  },
];

export function Essenszeiten() {
  return (
    <Card>
      <CardTitle>Essenszeiten je Dienst</CardTitle>
      <p className="mb-4 text-xs text-ink-muted">
        Entscheidend ist der Abstand zum Training: festes Essen braucht
        eineinhalb bis zwei Stunden. Casein kommt ins Porridge und in den
        Quark, Whey ausschliesslich in den Post-Workout-Shake — und den gibt
        es nur an Arbeitstagen nach dem Frühtraining.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {MUSTER.map((m) => (
          <div key={m.titel} className="rounded-xl bg-sand/60 p-3">
            <div className="text-sm font-medium text-ink">{m.titel}</div>
            <p className="mt-0.5 text-xs text-ink-muted">{m.hinweis}</p>

            <ul className="mt-2.5 space-y-1">
              {m.zeiten.map((z) => (
                <li key={z.uhr} className="flex gap-2.5 text-xs">
                  <span className="tabular w-11 shrink-0 text-ink-muted">{z.uhr}</span>
                  <span className={z.betont ? "text-ink" : "text-ink-soft"}>
                    {z.was}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Ziel bleibt 2&apos;100 kcal und mindestens 190 g Protein — alle vier
        Muster kommen auf rund 2&apos;080 kcal und 203 g.
      </p>
    </Card>
  );
}
