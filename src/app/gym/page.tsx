import Link from "next/link";
import {
  createGymClient, gymConfigured, type BodyWeightEntry,
} from "@/lib/supabase/gym";
import { GewohnheitenKarte } from "@/components/gewohnheiten-karte";
import { GymWeight } from "@/components/gym-weight";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Gym — Haken setzen, Gewicht sehen, sonst nichts.
 *
 * Bis zum 09.09.2026 stand hier ein Cockpit: nächster Split, Wochenziel nach
 * Kraft und Ausdauer, Trainingstage, Kalender, Fortschritt je Übung,
 * Muskelbalance. Das alles hat eine Erfassung vorausgesetzt, die es seit der
 * Uhr nicht mehr gibt, und Zahlen gezeigt, die keine Entscheidung verändert
 * haben.
 *
 * Übrig bleiben drei Dinge, und die liegen jetzt auf drei Reitern:
 *   Übersicht  war ich da (Haken) und was wiege ich
 *   Verlauf    was war (unverändert, nichts davon ist verloren)
 *   Garmin     was die Uhr geschickt hat
 */
export default async function GymPage() {
  if (!gymConfigured()) {
    return (
      <Card>
        <CardTitle>Verbindung zum Gym-Tracker</CardTitle>
        <p className="text-sm text-ink-muted">
          Der Gym-Tracker liegt in einer eigenen Datenbank. Damit KerimOS die
          Trainingsdaten lesen kann, brauchen wir zwei Umgebungsvariablen —
          lokal in{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code> und
          auf Vercel unter Settings → Environment Variables:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">GYM_SUPABASE_URL</code>
            <span className="text-ink-muted"> — die Projekt-URL des Gym-Projekts</span>
          </li>
          <li>
            <code className="rounded bg-sand px-1.5 py-0.5 text-xs">
              GYM_SUPABASE_SERVICE_ROLE_KEY
            </code>
            <span className="text-ink-muted">
              {" "}— der service_role-Schlüssel aus demselben Projekt
            </span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Beide tragen bewusst kein <code>NEXT_PUBLIC_</code>: der Schlüssel wird nur
          auf dem Server verwendet und erreicht den Browser nie. Behandle ihn wie ein
          Passwort — er umgeht sämtliche Zugriffsregeln der Gym-Datenbank.
        </p>
      </Card>
    );
  }

  const supabase = createGymClient();
  const { data: weightData } = await supabase!
    .from("body_weight_entries")
    .select("entry_date, weight_kg")
    .order("entry_date", { ascending: true });

  return (
    <>
      {/* Der Haken ist der ganze tägliche Umgang mit diesem Bereich. Deshalb
          steht er oben und ist das Erste, was man drücken kann. */}
      <GewohnheitenKarte
        bereich="gym"
        titel="War ich da"
        leer={
          "Noch keine Gewohnheit im Gym-Bereich. Leg unter Gewohnheiten eine " +
          "an und stell sie auf „Gym“ — dann steht der Haken hier."
        } />

      <GymWeight entries={(weightData ?? []) as BodyWeightEntry[]} />

      <Card>
        <CardTitle>Was die Uhr mitbringt</CardTitle>
        <p className="text-sm text-ink-muted">
          Die Garmin-Einheiten laufen unverändert weiter: der{" "}
          <Link href="/gym/garmin" className="text-accent-soft hover:underline">
            Import
          </Link>{" "}
          holt sie ab, geprüfte Einheiten landen im{" "}
          <Link href="/gym/verlauf" className="text-accent-soft hover:underline">
            Verlauf
          </Link>{" "}
          samt Sätzen und Gewichten. Der Haken oben zählt daneben nur, wie oft
          du da warst — er ersetzt nicht, was die Uhr aufzeichnet.
        </p>
      </Card>
    </>
  );
}
