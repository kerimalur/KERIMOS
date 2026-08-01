"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logSleep } from "@/lib/actions";
import { Button } from "@/components/ui";

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const toMin = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const fmtDauer = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;

/**
 * Der Schlafvorschlag am Morgen.
 *
 * Der Vorschlag - Ende des letzten gestrigen Eintrags bis jetzt - stimmt oft,
 * aber eben nicht immer: wer nach dem letzten Eintrag noch zwei Stunden wach
 * war, hat nicht seit 22 Uhr geschlafen. Deshalb gibt es neben dem Bestätigen
 * auch den Weg, die tatsächlichen Zeiten einzutragen.
 *
 * Beide Wege laufen in dieselbe Aktion; die Aufteilung über Mitternacht
 * erledigt der Server.
 */
export function SleepPrompt({ von, bis }: { von: number; bis: number }) {
  const router = useRouter();
  const [eigene, setEigene] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eVon, setEVon] = useState(hhmm(von));
  const [eBis, setEBis] = useState(hhmm(bis));

  const vorschlagDauer = (1440 - von) + bis;

  const vMin = toMin(eVon);
  const bMin = toMin(eBis);
  const eigeneDauer = vMin !== null && bMin !== null && bMin !== vMin
    ? (bMin > vMin ? bMin - vMin : bMin + 1440 - vMin)
    : null;

  async function eintragen(vonText: string, bisText: string) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("von", vonText);
    fd.set("bis", bisText);
    await logSleep(fd);
    setBusy(false);
    router.refresh();
  }

  const zeitFeld =
    "flex-1 rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink " +
    "outline-none transition focus:border-accent";

  return (
    <div className="mt-4 rounded-xl border border-accent bg-accent-tint p-3">
      <p className="text-xs text-accent-soft">Geschlafen seit dem letzten Eintrag</p>

      {!eigene ? (
        <>
          <p className="tabular mt-1 text-lg font-medium text-ink">
            {hhmm(von)} – {hhmm(bis)}
            <span className="ml-2 text-sm font-normal text-ink-soft">
              {fmtDauer(vorschlagDauer)}
            </span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button onClick={() => eintragen(hhmm(von), hhmm(bis))} disabled={busy}
              className="flex-1">
              {busy ? "…" : "Stimmt, als Schlaf eintragen"}
            </Button>
            <Button variant="ghost" onClick={() => setEigene(true)} disabled={busy}>
              Andere Zeiten
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink">
            Wann bist du wirklich schlafen gegangen?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input type="time" value={eVon} onChange={(e) => setEVon(e.target.value)}
              aria-label="Eingeschlafen um" className={zeitFeld} />
            <span className="text-xs text-ink-muted">bis</span>
            <input type="time" value={eBis} onChange={(e) => setEBis(e.target.value)}
              aria-label="Aufgewacht um" className={zeitFeld} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="tabular text-xs text-ink-soft">
              {eigeneDauer !== null
                ? fmtDauer(eigeneDauer)
                : "Start und Ende sind gleich"}
            </span>
            <span className="flex items-center gap-2">
              <button onClick={() => setEigene(false)} disabled={busy}
                className="text-xs text-ink-muted transition hover:text-ink-soft">
                Zurück
              </button>
              <Button onClick={() => eintragen(eVon, eBis)}
                disabled={busy || eigeneDauer === null}
                className="px-4 py-1.5 text-xs">
                {busy ? "…" : "Eintragen"}
              </Button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
