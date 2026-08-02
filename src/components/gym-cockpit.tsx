"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startWorkout } from "@/lib/actions";
import { Badge, Button, Card, CardTitle, Empty, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { dayNameShort } from "@/lib/time";

interface Entry {
  id: string; training_day_id: string; trainingDayName: string;
  scheduled_date: string; status: string; offeneSessionId: string | null;
}
interface DayLite {
  id: string; name: string; anzahlUebungen: number; muscles: string[];
}
/** "heute" · "morgen" · "Do, 06.08.2026" */
function datumText(iso: string, heute: string, morgen: string): string {
  if (iso === heute) return "heute";
  if (iso === morgen) return "morgen";
  return `${dayNameShort(iso)}, ${dateLabel(iso)}`;
}

/**
 * Einstieg in den Gym-Bereich: was als Nächstes ansteht, welche Vorlagen es
 * gibt und wie ausgewogen zuletzt trainiert wurde. Der Start-Knopf legt die
 * Einheit an und wechselt in die Gym-App.
 */
export function GymCockpit({
  entries, days, heute, morgen, wochenZiel, dieseWoche,
  letzterSplit, letzterTag, naechsterSplit,
}: {
  entries: Entry[];
  days: DayLite[];
  heute: string;
  morgen: string;
  wochenZiel: number;
  dieseWoche: number;
  /** Split der letzten tatsächlich trainierten Einheit. */
  letzterSplit: string | null;
  /** Tag dazu, ISO. */
  letzterTag: string | null;
  /** Der logische Gegenpart - null, wenn nicht ableitbar. */
  naechsterSplit: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function starten(dayId: string, entry?: Entry) {
    if (busy) return;
    // Läuft schon eine Einheit, direkt dorthin - ohne eine zweite anzulegen
    if (entry?.offeneSessionId) {
      router.push(`/gym/workout/${entry.offeneSessionId}`);
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const fd = new FormData();
      fd.set("training_day_id", dayId);
      if (entry) {
        fd.set("calendar_entry_id", entry.id);
        fd.set("date", entry.scheduled_date);
      }
      const url = await startWorkout(fd);
      router.push(url);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Training konnte nicht gestartet werden");
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      {/* Wochenziel */}
      <Card>
        <CardTitle>Diese Woche</CardTitle>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="tabular text-[26px] font-medium leading-tight text-ink">
            {dieseWoche} <span className="text-base text-ink-muted">von {wochenZiel}</span>
          </span>
          {dieseWoche >= wochenZiel && <Badge tone="good">Ziel erreicht</Badge>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-sand">
          <div className={cx("h-full rounded-full",
            dieseWoche >= wochenZiel ? "bg-good" : "bg-accent")}
            style={{
              width: `${wochenZiel > 0
                ? (Math.min(dieseWoche, wochenZiel) / wochenZiel) * 100 : 0}%`,
            }} />
        </div>
      </Card>

      {/* Nächste Trainings */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="mb-0">Nächste Trainings</CardTitle>
          <Link href="/gym/kalender"
            className="text-xs font-medium text-accent-soft transition hover:underline">
            Planen →
          </Link>
        </div>
        {/* Vorschlag aus dem, was zuletzt dran war. Steht auch dann da, wenn
            nichts geplant ist - seit die Uhr trackt, plant Kerim kaum noch
            im Kalender, braucht aber trotzdem die Antwort "was heute?". */}
        {naechsterSplit && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-sand/60 px-3 py-2">
            <span className="text-xs text-ink-muted">
              Zuletzt {letzterSplit} {letzterTag ? datumText(letzterTag, heute, morgen) : ""} —
              dran wäre
            </span>
            <span className="text-sm font-medium text-ink">{naechsterSplit}</span>
            {(() => {
              const tag = days.find(
                (d) => d.name.toLowerCase() === naechsterSplit.toLowerCase(),
              );
              if (!tag) return null;
              return (
                <Button onClick={() => starten(tag.id)} disabled={busy}
                  className="ml-auto shrink-0 px-3 py-1.5 text-xs">
                  Start
                </Button>
              );
            })()}
          </div>
        )}

        {entries.length === 0 ? (
          naechsterSplit ? null : (
            <Empty>
              Nichts geplant.{" "}
              <Link href="/gym/kalender" className="text-accent-soft hover:underline">
                Training einplanen
              </Link>
            </Empty>
          )
        ) : (
          <ul className="divide-y divide-line">
            {entries.slice(0, 5).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="w-32 shrink-0 text-xs text-ink-muted">
                  {datumText(e.scheduled_date, heute, morgen)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {e.trainingDayName}
                </span>
                {e.offeneSessionId && <Badge tone="warn">läuft</Badge>}
                <Button onClick={() => starten(e.training_day_id, e)} disabled={busy}
                  className="shrink-0 px-3 py-1.5 text-xs">
                  {e.offeneSessionId ? "Fortsetzen" : "Start"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Trainingstage als Schnellstart */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="mb-0">Meine Trainingstage</CardTitle>
          <Link href="/gym/trainingstage"
            className="text-xs font-medium text-accent-soft transition hover:underline">
            Verwalten →
          </Link>
        </div>
        {days.length === 0 ? (
          <Empty>
            Noch kein Trainingstag.{" "}
            <Link href="/gym/trainingstage" className="text-accent-soft hover:underline">
              Ersten anlegen
            </Link>
          </Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {days.map((d) => (
              <div key={d.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{d.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {d.anzahlUebungen} Übungen
                    {d.muscles.length > 0 && ` · ${d.muscles.slice(0, 2).join(", ")}`}
                  </span>
                </span>
                <Button onClick={() => starten(d.id)}
                  disabled={busy || d.anzahlUebungen === 0}
                  variant="ghost" className="shrink-0 px-3 py-1.5 text-xs">
                  Start
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

    </>
  );
}
