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
interface MuscleLoad { id: string; name: string; sets: number; lastTrainedAt: string | null }

/** "heute" · "morgen" · "Do, 06.08.2026" */
function datumText(iso: string, heute: string, morgen: string): string {
  if (iso === heute) return "heute";
  if (iso === morgen) return "morgen";
  return `${dayNameShort(iso)}, ${dateLabel(iso)}`;
}

/** "vor 5 Tagen" - und ob das schon zu lange her ist. */
function seitText(iso: string | null): { text: string; hinterher: boolean } {
  if (!iso) return { text: "nie trainiert", hinterher: true };
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (tage === 0) return { text: "heute", hinterher: false };
  if (tage === 1) return { text: "gestern", hinterher: false };
  return { text: `vor ${tage} Tagen`, hinterher: tage >= 7 };
}

/**
 * Einstieg in den Gym-Bereich: was als Nächstes ansteht, welche Vorlagen es
 * gibt und wie ausgewogen zuletzt trainiert wurde. Der Start-Knopf legt die
 * Einheit an und wechselt in die Gym-App.
 */
export function GymCockpit({
  entries, days, balance, heute, morgen, wochenZiel, dieseWoche, gymAppUrl,
}: {
  entries: Entry[];
  days: DayLite[];
  balance: MuscleLoad[];
  heute: string;
  morgen: string;
  wochenZiel: number;
  dieseWoche: number;
  gymAppUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const maxSets = Math.max(1, ...balance.map((m) => m.sets));
  const hinterher = balance.filter((m) => seitText(m.lastTrainedAt).hinterher).length;

  async function starten(dayId: string, entry?: Entry) {
    if (busy) return;
    if (entry?.offeneSessionId) {
      window.location.href = `${gymAppUrl}/workout/${entry.offeneSessionId}`;
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
      window.location.href = url;
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
        {entries.length === 0 ? (
          <Empty>
            Nichts geplant.{" "}
            <Link href="/gym/kalender" className="text-accent-soft hover:underline">
              Training einplanen
            </Link>
          </Empty>
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

      {/* Muskelbalance */}
      <Card>
        <CardTitle>Muskelbalance · 4 Wochen</CardTitle>
        {hinterher > 0 && (
          <p className="mb-3 rounded-xl bg-warn-tint px-3 py-2 text-xs text-warn">
            {hinterher} {hinterher === 1 ? "Muskelgruppe" : "Muskelgruppen"} seit
            über einer Woche nicht trainiert.
          </p>
        )}
        {balance.length === 0 ? (
          <Empty>Noch keine Trainingsdaten.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {balance.map((m) => {
              const s = seitText(m.lastTrainedAt);
              return (
                <li key={m.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink-soft">{m.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {m.sets} {m.sets === 1 ? "Satz" : "Sätze"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className={cx("h-full rounded-full",
                      s.hinterher ? "bg-warn" : "bg-accent")}
                      style={{ width: `${m.sets === 0 ? 3 : (m.sets / maxSets) * 100}%` }} />
                  </div>
                  <span className={cx("mt-0.5 block text-[11px]",
                    s.hinterher ? "text-warn" : "text-ink-faint")}>
                    {s.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
