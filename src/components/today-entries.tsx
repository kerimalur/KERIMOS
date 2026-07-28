"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTimedEntry, deleteTimeEntry } from "@/lib/actions";
import { Button, Card, Select, cx } from "@/components/ui";
import type { Activity } from "@/lib/types";

export interface HeuteEintrag {
  id: string;
  activity_id: string;
  minutes: number;
  start_minute: number | null;
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const fmtMin = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ""}` : `${m} m`;

/**
 * "Heute erfasst" fürs Handy: was schon verbucht ist (löschbar), plus
 * Nachtragen mit Startzeit - für das Gym von vor zwei Stunden, ohne dass
 * die Uhr hätte laufen müssen.
 */
export function TodayEntries({
  entries, activities,
}: {
  entries: HeuteEintrag[];
  activities: Activity[];
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [aktivitaet, setAktivitaet] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = new Map(activities.map((a) => [a.id, a]));
  const sortiert = [...entries].sort(
    (a, b) => (a.start_minute ?? 9999) - (b.start_minute ?? 9999)
  );

  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const vonMin = toMin(von);
  const bisMin = toMin(bis);
  const dauer = vonMin !== null && bisMin !== null && bisMin > vonMin
    ? bisMin - vonMin : null;

  async function nachtragen() {
    if (!aktivitaet || dauer === null || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("activity_id", aktivitaet);
    fd.set("entry_date", new Date().toISOString().slice(0, 10));
    fd.set("start", von);
    fd.set("minutes", String(dauer));
    await addTimedEntry(fd);
    setBusy(false);
    setVon(""); setBis(""); setAktivitaet(""); setOffen(false);
    router.refresh();
  }

  async function loeschen(id: string) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", id);
    await deleteTimeEntry(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Heute erfasst
        </span>
        <button onClick={() => setOffen(!offen)}
          className="rounded-lg bg-sand px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:text-ink">
          {offen ? "Schliessen" : "+ Nachtragen"}
        </button>
      </div>

      {/* Nachtragen: Aktivität + von/bis - für Vergessenes */}
      {offen && (
        <div className="mb-3 space-y-2.5 rounded-xl bg-sand/60 p-3">
          <Select value={aktivitaet} onChange={(e) => setAktivitaet(e.target.value)}
            aria-label="Aktivität">
            <option value="">— Was hast du gemacht? —</option>
            {activities.filter((a) => !a.is_sleep).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <input type="time" value={von} onChange={(e) => setVon(e.target.value)}
              aria-label="Von"
              className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            <span className="text-xs text-ink-muted">bis</span>
            <input type="time" value={bis} onChange={(e) => setBis(e.target.value)}
              aria-label="Bis"
              className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">
              {dauer !== null ? fmtMin(dauer)
                : bisMin !== null && vonMin !== null ? "Ende muss nach Start liegen" : ""}
            </span>
            <Button onClick={nachtragen} disabled={!aktivitaet || dauer === null || busy}
              className="px-4 py-1.5 text-xs">
              {busy ? "…" : "Eintragen"}
            </Button>
          </div>
        </div>
      )}

      {sortiert.length === 0 ? (
        <p className="text-sm text-ink-muted">Noch nichts verbucht.</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {sortiert.map((e) => {
            const a = byId.get(e.activity_id);
            return (
              <li key={e.id} className="flex items-center gap-2.5 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: a?.color ?? "#A8A093" }} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {a?.name ?? "Unbekannt"}
                </span>
                <span className="tabular shrink-0 text-xs text-ink-muted">
                  {e.start_minute !== null
                    ? `${hhmm(e.start_minute)}–${hhmm(Math.min(e.start_minute + e.minutes, 1439))}`
                    : fmtMin(e.minutes)}
                </span>
                <button onClick={() => loeschen(e.id)} disabled={busy}
                  aria-label="Eintrag löschen"
                  className={cx("shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad",
                    busy && "opacity-50")}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
