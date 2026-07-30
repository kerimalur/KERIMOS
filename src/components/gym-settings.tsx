"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveWeeklyGoal } from "@/lib/actions";
import { Card, CardTitle, cx } from "@/components/ui";

interface MuscleGroup { id: string; name: string; base_recovery_hours: number }

const BEREICHE = [
  { href: "/gym/uebungen", titel: "Übungen",
    text: "Datenbank durchsuchen, eigene Übung anlegen" },
  { href: "/gym/fortschritt", titel: "Fortschritt",
    text: "Verlauf je Übung, geschätztes 1RM, Cardio" },
  { href: "/gym/balance", titel: "Muskelbalance",
    text: "Gegenspieler-Paare und Volumen je Muskelgruppe" },
];

/**
 * Einstellungen und Einstiegspunkte des Gym-Bereichs. Das Wochenziel lag
 * früher nur im Browser der alten Gym-App - jetzt in der Datenbank.
 */
export function GymSettings({
  weeklyGoal, muscleGroups, dieseWoche,
}: {
  weeklyGoal: number;
  muscleGroups: MuscleGroup[];
  /** Abgeschlossene Einheiten seit Montag. */
  dieseWoche: number;
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
        <CardTitle>Bereiche</CardTitle>
        <ul className="divide-y divide-line">
          {BEREICHE.map((b) => (
            <li key={b.href}>
              <Link href={b.href}
                className="flex items-center justify-between gap-3 py-3 transition hover:text-accent-soft">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.titel}</span>
                  <span className="block text-xs text-ink-muted">{b.text}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Trainings pro Woche</CardTitle>
        <p className="mb-3 text-xs text-ink-muted">
          Wird in der Datenbank gespeichert, nicht im Browser — die Zahl gilt
          also auf jedem Gerät.
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
          Der Ausgangswert für die Erholungsrechnung. Viele Sätze und ein
          tiefer RIR verlängern ihn, wenige und ein hoher verkürzen ihn.
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
        <CardTitle>Während des Trainings</CardTitle>
        <p className="text-sm text-ink-muted">
          Der Zwischenstand einer laufenden Einheit liegt im Browser und wird
          bei jeder Eingabe gesichert. Sperrt sich das Handy oder lädt die
          Seite neu, ist alles noch da — in der Datenbank landet es erst beim
          Abschliessen.
        </p>
      </Card>
    </>
  );
}
