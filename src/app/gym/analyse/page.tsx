import { GymAnalyse, type Zeitraum } from "@/components/gym-analyse";
import { Card, CardTitle, Empty } from "@/components/ui";
import {
  gymConfigured, fetchMuskelAnalyse, fetchMuskelGrenzen, MUSKEL_GRENZEN_SQL,
} from "@/lib/supabase/gym";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Wie oft welcher Muskel drankam.
 *
 * Alle drei Zeiträume werden vorgeladen — das Umschalten soll ohne Nachladen
 * gehen. Drei Abfragen statt einer klingt teuer und ist es nicht: die
 * Stammdaten (Übungen, Muskelgruppen) hängen im Cache, gelesen werden nur
 * die Sätze.
 */
const ZEITRAEUME = [
  { key: "woche", label: "Letzte Woche", tage: 7 },
  { key: "monat", label: "Letzter Monat", tage: 28 },
  { key: "zwei", label: "Letzte 2 Monate", tage: 56 },
];

export default async function GymAnalysePage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const [roh, { grenzen, spalteFehlt }] = await Promise.all([
    Promise.all(ZEITRAEUME.map((z) => fetchMuskelAnalyse(z.tage))),
    fetchMuskelGrenzen(),
  ]);

  // Die Tage seit dem letzten Mal werden HIER gerechnet, nicht im Browser:
  // `Date.now()` im Client ergibt beim ersten Rendern eine andere Zahl als
  // auf dem Server, und React meldet das als Hydrations-Fehler.
  const heute = new Date(`${heuteISO()}T12:00:00`).getTime();
  const seit = (iso: string | null) =>
    iso === null ? null
      : Math.max(0, Math.round((heute - new Date(iso).getTime()) / 86400000));

  const zeitraeume: Zeitraum[] = ZEITRAEUME.map((z, i) => ({
    ...z,
    werte: roh[i].map((w) => ({
      id: w.id, name: w.name, direkt: w.direkt, indirekt: w.indirekt,
      tage: w.tage, seitTagen: seit(w.zuletzt), uebungen: w.uebungen,
    })),
  }));

  const leer = zeitraeume.every((z) => z.werte.every((w) => w.direkt + w.indirekt === 0));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Analyse</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Wie oft welcher Muskel drankam. Körper drehen mit gedrückter Maustaste
          oder dem Finger, Muskelgruppe antippen für die Übungen dahinter.
        </p>
      </div>

      <GymAnalyse zeitraeume={zeitraeume} grenzen={grenzen} />

      {leer && (
        <Card>
          <CardTitle>Noch nichts zu sehen</CardTitle>
          <p className="text-sm text-ink-soft">
            Gezählt werden nur <strong>abgeschlossene</strong> Trainings. Läuft
            eine Einheit noch, taucht sie hier erst auf, wenn sie beendet ist.
          </p>
        </Card>
      )}

      {spalteFehlt && (
        <Card flat>
          <CardTitle>Eigene Grenzen setzen</CardTitle>
          <p className="text-sm text-ink-soft">
            Zurzeit gilt für jede Gruppe die Faustregel 10–20 Sätze pro Woche.
            Damit du je Muskelgruppe eigene Werte hinterlegen kannst, muss die
            Spalte einmal angelegt werden — im Supabase-SQL-Editor der
            <strong> Gym</strong>-Datenbank, nicht der von KerimOS:
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-xl bg-sand/70 p-3 text-[11.5px] leading-relaxed text-ink-soft">
            <code>{MUSKEL_GRENZEN_SQL}</code>
          </pre>
        </Card>
      )}
    </div>
  );
}
