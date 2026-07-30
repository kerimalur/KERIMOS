"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveWeeklyGoal } from "@/lib/actions";
import { Card, CardTitle, cx } from "@/components/ui";

interface MuscleGroup { id: string; name: string; base_recovery_hours: number }

/**
 * Einstellungen des Gym-Bereichs. Das Wochenziel lag früher nur im Browser
 * der Gym-App - jetzt in der Datenbank, damit beide Apps dieselbe Zahl sehen.
 */
export function GymSettings({
  weeklyGoal, muscleGroups, dieseWoche, gymAppUrl,
}: {
  weeklyGoal: number;
  muscleGroups: MuscleGroup[];
  /** Abgeschlossene Einheiten seit Montag. */
  dieseWoche: number;
  gymAppUrl: string;
}) {
  const router = useRouter();
  const [ziel, setZiel] = useState(weeklyGoal);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern(n: number) {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    const vorher = ziel;
    setZiel(n);
    try {
      const fd = new FormData();
      fd.set("weekly_goal", String(n));
      await saveWeeklyGoal(fd);
      router.refresh();
    } catch (e) {
      // Häufigster Fall: die Tabelle gym_settings fehlt noch. Dann steht die
      // alte Zahl wieder da, statt eine gespeicherte vorzutäuschen.
      setZiel(vorher);
      setFehler(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const erreicht = Math.min(dieseWoche, ziel);

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
          <span className="mt-1 block text-xs">
            Fehlt die Tabelle noch? Dann einmalig{" "}
            <code className="rounded bg-card px-1 py-0.5">
              supabase/migrations/09_gym_settings.sql
            </code>{" "}
            im SQL-Editor des Gym-Projekts ausführen.
          </span>
        </div>
      )}

      <Card>
        <CardTitle>Trainings pro Woche</CardTitle>
        <p className="mb-3 text-xs text-ink-muted">
          Gilt für beide Apps — die Zahl steht in der Datenbank, nicht im Browser.
        </p>
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} onClick={() => speichern(n)} disabled={busy}
              className={cx(
                "aspect-square rounded-xl text-base font-medium transition active:scale-95",
                ziel === n
                  ? "bg-accent text-white"
                  : "bg-sand text-ink-muted hover:text-ink-soft"
              )}>
              {n}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">Diese Woche</span>
            <span className="tabular text-sm text-ink">
              {dieseWoche} von {ziel}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sand">
            <div className={cx("h-full rounded-full",
              dieseWoche >= ziel ? "bg-good" : "bg-accent")}
              style={{ width: `${ziel > 0 ? (erreicht / ziel) * 100 : 0}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {dieseWoche >= ziel
              ? "Ziel erreicht."
              : `Noch ${ziel - dieseWoche} ${ziel - dieseWoche === 1 ? "Einheit" : "Einheiten"} bis Sonntag.`}
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>Muskelgruppen</CardTitle>
        <p className="mb-3 text-xs text-ink-muted">
          Die Erholungszeit ist der Ausgangswert, mit dem gerechnet wird. Wie
          lange es wirklich dauert, passt die Gym-App anhand deiner Rückmeldung
          nach dem Training an.
        </p>
        <ul className="divide-y divide-line">
          {muscleGroups.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-ink">{m.name}</span>
              <span className="tabular text-xs text-ink-muted">
                {Math.round(m.base_recovery_hours)} h
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Training selbst</CardTitle>
        <p className="text-sm text-ink-muted">
          Geplant und verwaltet wird hier, trainiert in der Gym-App. Das ist
          Absicht: Timer und Satz-Erfassung laufen dort in einer kleinen App,
          die selten neu ausgeliefert wird — mitten im Training soll nichts
          dazwischenkommen.
        </p>
        <a href={gymAppUrl} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-accent-soft transition hover:underline">
          Gym-App öffnen ↗
        </a>
      </Card>
    </>
  );
}
