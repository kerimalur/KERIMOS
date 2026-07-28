import Link from "next/link";
import {
  createGymClient, gymConfigured, buildSeries,
  type GymTopSet, type BodyWeightEntry,
} from "@/lib/supabase/gym";
import { GymProgress } from "@/components/gym-progress";
import { GymWeight } from "@/components/gym-weight";
import { GymCalendar } from "@/components/gym-calendar";
import { Card, CardTitle, Stat, Empty } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GymPage() {
  if (!gymConfigured()) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-medium text-ink">Gym</h1>
          <p className="mt-1 text-sm text-ink-muted">Zugang noch nicht eingerichtet.</p>
        </div>
        <Card>
          <CardTitle>Verbindung zum Gym-Tracker</CardTitle>
          <p className="text-sm text-ink-muted">
            Der Gym-Tracker liegt in einer eigenen Datenbank. Damit KerimOS die
            Trainingsdaten lesen kann, brauchen wir zwei Umgebungsvariablen — lokal in{" "}
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
      </div>
    );
  }

  const supabase = createGymClient();
  const [{ data, error }, { data: weightData }] = await Promise.all([
    supabase!
      .from("v_exercise_progress")
      .select("*")
      .order("day", { ascending: true }),
    supabase!
      .from("body_weight_entries")
      .select("entry_date, weight_kg")
      .order("entry_date", { ascending: true }),
  ]);

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-medium text-ink">Gym</h1>
        <Card>
          <p className="text-sm text-bad">
            Die Trainingsdaten liessen sich nicht laden.
          </p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{error.message}</p>
        </Card>
      </div>
    );
  }

  // Bewusst ausgeblendete Übungen - tauchen in Auswertung und Zählung nicht auf
  const ausgeblendet = [/liegestütz/i, /overhead\s*.?trizeps/i, /trizeps\s*.?overhead/i, /face\s*.?pull/i];
  const rows = ((data ?? []) as GymTopSet[])
    .filter((r) => !ausgeblendet.some((rx) => rx.test(r.exercise)));
  const series = buildSeries(rows);
  const weights = (weightData ?? []) as BodyWeightEntry[];

  // ISO-Tag → Splits, die an dem Tag trainiert wurden (für den Kalender)
  const trainedDays: Record<string, string[]> = {};
  for (const r of rows) {
    const split = r.split ?? "Training";
    const list = trainedDays[r.day] ?? [];
    if (!list.includes(split)) list.push(split);
    trainedDays[r.day] = list;
  }

  const alleTage = [...new Set(rows.map((r) => r.day))].sort();
  const einheiten = new Set(rows.map((r) => r.session_id)).size;
  const uebungen = new Set(rows.map((r) => r.exercise)).size;

  // Wie viele Übungen haben sich seit dem ersten Eintrag verbessert?
  const alleSerien = Object.values(series).flat();
  const besser = alleSerien.filter((s) => s.last > s.first).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Gym</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {alleTage.length > 0 ? (
            <>
              Abgeschlossene Einheiten von {dateLabel(alleTage[0])} bis{" "}
              {dateLabel(alleTage[alleTage.length - 1])}. Pro Übung der schwerste Satz
              je Einheit — das ist die Zahl, an der Fortschritt sichtbar wird.
            </>
          ) : (
            "Noch keine abgeschlossenen Einheiten erfasst."
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty>
          Keine Trainingsdaten gefunden. Sobald du im Gym-Tracker eine Einheit
          abschliesst, erscheint sie hier.
        </Empty>
      ) : (
        <>
          <Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Einheiten" value={String(einheiten)} />
              <Stat label="Übungen" value={String(uebungen)} />
              <Stat label="Im Aufwärtstrend" tone={besser > 0 ? "good" : "neutral"}
                value={`${besser} von ${alleSerien.length}`}
                sub="mit mindestens zwei Einheiten" />
              <Stat label="Letzte Einheit"
                value={dateLabel(alleTage[alleTage.length - 1])} />
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <GymWeight entries={weights} />
            <GymCalendar trainedDays={trainedDays} />
          </div>

          <GymProgress data={series} />
        </>
      )}

      <p className="text-xs text-ink-muted">
        Die Daten kommen live aus dem Gym-Tracker.{" "}
        <Link href="https://gymapp-vereinfacht.vercel.app" target="_blank"
          rel="noopener noreferrer" className="text-accent-soft hover:underline">
          Dort trainieren und erfassen →
        </Link>
      </p>
    </div>
  );
}
