"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import {
  STATI, naechsterStatus, kalenderwoche, type Wochenziel, type ZielStatus,
} from "@/lib/wochenziele/typen";
import { zielAnlegen, zielAendern, zielLoeschen } from "@/lib/wochenziele/actions";

/**
 * Die Wochenziele — so bedient wie Todoist beim Hinzufügen.
 *
 * Unten in jeder Gruppe „+ Ziel hinzufügen": ein Klick öffnet das Feld, Titel
 * tippen, Enter — fertig, und das Feld bleibt offen für das nächste. Details
 * sind optional. Der Kreis links schaltet den Zustand weiter (offen →
 * angefangen → fertig), ein Klick auf den Titel klappt das Ziel zum
 * Bearbeiten auf.
 */

export function WochenzieleListe({ ziele, woche }: { ziele: Wochenziel[]; woche: string }) {
  const [offenesZiel, setOffenesZiel] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {STATI.map((s) => {
        const gruppe = ziele.filter((z) => z.status === s.key);
        return (
          <section key={s.key} className="rounded-2xl border border-line/70 bg-card p-4 shadow-card">
            <h2 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase
                           tracking-[0.12em] text-ink-muted">
              <StatusKreis status={s.key} klein />
              {s.label}
              <span className="ml-auto tabular text-ink-faint">{gruppe.length}</span>
            </h2>

            <ul className="divide-y divide-line/60">
              {gruppe.map((z) => (
                <ZielZeile key={z.id} z={z}
                  offen={offenesZiel === z.id}
                  umschalten={() => setOffenesZiel(offenesZiel === z.id ? null : z.id)} />
              ))}
            </ul>

            {gruppe.length === 0 && s.key !== "offen" && (
              <p className="py-3 text-xs text-ink-faint">Noch nichts hier.</p>
            )}

            <Hinzufuegen woche={woche} status={s.key} />
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Status-Kreis */

function StatusKreis({ status, klein }: { status: ZielStatus; klein?: boolean }) {
  const g = klein ? 12 : 18;
  if (status === "fertig") {
    return (
      <svg width={g} height={g} viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="8" fill="#5FC2A6" />
        <path d="M5 9.4l2.6 2.5L13 6.5" stroke="#17130F" strokeWidth="1.8" fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "angefangen") {
    return (
      <svg width={g} height={g} viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="7.5" stroke="#E7A96B" strokeWidth="1.5" fill="none" />
        <path d="M9 1.5 A7.5 7.5 0 0 1 9 16.5 Z" fill="#E7A96B" />
      </svg>
    );
  }
  return (
    <svg width={g} height={g} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7.5" stroke="#9A8C74" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/* --------------------------------------------------------------- Eine Zeile */

function ZielZeile({ z, offen, umschalten }: {
  z: Wochenziel; offen: boolean; umschalten: () => void;
}) {
  const [laeuft, start] = useTransition();
  const [titel, setTitel] = useState(z.titel);
  const [details, setDetails] = useState(z.details);
  const [fehler, setFehler] = useState<string | null>(null);

  // Neue Daten vom Server übernehmen, solange nicht gerade bearbeitet wird.
  useEffect(() => { if (!offen) { setTitel(z.titel); setDetails(z.details); } },
    [z.titel, z.details, offen]);

  const aendern = (felder: Parameters<typeof zielAendern>[1]) =>
    start(async () => setFehler(await zielAendern(z.id, felder)));

  const speichern = () => {
    aendern({ titel, details });
    umschalten();
  };

  return (
    <li className={cx("py-2.5 transition", laeuft && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <button type="button" title="Zustand weiterschalten"
          onClick={() => aendern({ status: naechsterStatus(z.status) })}
          className="mt-0.5 shrink-0 rounded-full transition hover:scale-110 active:scale-95">
          <StatusKreis status={z.status} />
        </button>

        <button type="button" onClick={umschalten} className="min-w-0 flex-1 text-left">
          <span className={cx("block text-sm leading-snug",
            z.status === "fertig" ? "text-ink-muted line-through" : "text-ink")}>
            {z.titel}
          </span>
          {!offen && z.details && (
            <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs text-ink-muted">
              {z.details}
            </span>
          )}
          {(z.dringend || z.seit) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {z.dringend && (
                <span className="rounded-md bg-bad-tint px-1.5 py-0.5 text-[10px] font-semibold
                                 uppercase tracking-wide text-bad-bright">dringend</span>
              )}
              {z.seit && (
                <span className="rounded-md bg-sand px-1.5 py-0.5 text-[10px] text-ink-muted">
                  seit KW {kalenderwoche(z.seit)}
                </span>
              )}
            </span>
          )}
        </button>
      </div>

      {offen && (
        <div className="mt-2.5 space-y-2 pl-7">
          <input value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") speichern(); if (e.key === "Escape") umschalten(); }}
            className="w-full rounded-lg border border-line bg-field px-2.5 py-1.5 text-sm text-ink
                       outline-none focus:border-accent" />
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3}
            placeholder="Details"
            className="w-full resize-y rounded-lg border border-line bg-field px-2.5 py-1.5 text-xs
                       text-ink-soft outline-none placeholder:text-ink-faint focus:border-accent" />

          <div className="flex flex-wrap gap-1">
            {STATI.map((s) => (
              <button key={s.key} type="button" onClick={() => aendern({ status: s.key })}
                className={cx("rounded-lg px-2 py-1 text-[11px] transition",
                  z.status === s.key ? "bg-accent text-ink-on" : "bg-sand text-ink-muted hover:text-ink")}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={speichern}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on">
              Speichern
            </button>
            <button type="button" onClick={() => aendern({ dringend: !z.dringend })}
              className="rounded-lg border border-line bg-sand px-3 py-1.5 text-xs text-ink-soft">
              {z.dringend ? "Nicht mehr dringend" : "Als dringend markieren"}
            </button>
            <button type="button"
              onClick={() => { if (confirm(`„${z.titel}" löschen?`)) start(async () => { setFehler(await zielLoeschen(z.id)); }); }}
              className="ml-auto rounded-lg px-2 py-1.5 text-xs text-bad-bright hover:bg-bad-tint">
              Löschen
            </button>
          </div>
          {fehler && <p className="text-xs text-bad-bright">{fehler}</p>}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ Hinzufügen */

function Hinzufuegen({ woche, status }: { woche: string; status: ZielStatus }) {
  const [auf, setAuf] = useState(false);
  const [titel, setTitel] = useState("");
  const [details, setDetails] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const feld = useRef<HTMLInputElement>(null);

  const anlegen = () => {
    if (!titel.trim()) return;
    const t = titel, d = details;
    setTitel(""); setDetails("");
    start(async () => {
      const f = await zielAnlegen({ woche, titel: t, details: d, status });
      setFehler(f);
      if (f) { setTitel(t); setDetails(d); }
      feld.current?.focus();
    });
  };

  if (!auf) {
    return (
      <button type="button" onClick={() => setAuf(true)}
        className="group mt-1 flex w-full items-center gap-2 rounded-lg py-2 text-sm text-ink-muted
                   transition hover:text-accent-soft">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-accent
                         transition group-hover:bg-accent group-hover:text-ink-on">+</span>
        Ziel hinzufügen
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-line-strong bg-field p-2.5">
      <input ref={feld} value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus
        placeholder="z.B. 20 Backtest-Trades"
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); anlegen(); }
          if (e.key === "Escape") setAuf(false);
        }}
        className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink-faint" />
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2}
        placeholder="Beschreibung"
        onKeyDown={(e) => { if (e.key === "Escape") setAuf(false); }}
        className="mt-1 w-full resize-none bg-transparent text-xs text-ink-soft outline-none
                   placeholder:text-ink-faint" />
      <div className="mt-2 flex justify-end gap-2 border-t border-line pt-2">
        <button type="button" onClick={() => { setAuf(false); setTitel(""); setDetails(""); }}
          className="rounded-lg bg-sand px-3 py-1.5 text-xs text-ink-soft">
          Abbrechen
        </button>
        <button type="button" onClick={anlegen} disabled={!titel.trim() || laeuft}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on
                     disabled:opacity-40">
          Ziel hinzufügen
        </button>
      </div>
      {fehler && <p className="mt-1 text-xs text-bad-bright">{fehler}</p>}
    </div>
  );
}
