"use client";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { WOCHENTAGE, proWoche, istAnzahl, type Handlung, type RoutineZiel } from "@/lib/routinen/typen";
import {
  routineZielAnlegen, routineZielAendern, routineZielLoeschen,
  handlungAnlegen, handlungAendern, handlungLoeschen,
} from "@/lib/routinen/actions";

/**
 * Ziele und was man dafür tut.
 *
 * Pro Ziel eine Karte. Darin die Handlungen mit ihren Wochentagen (Chips
 * zum Umschalten) und einer optionalen Uhrzeit — mit Uhrzeit kommt die
 * Push-Meldung genau dann, ohne Uhrzeit gesammelt um 07:00. Oben rechts
 * steht, wie oft pro Woche man etwas für das Ziel tut: das ist die Zahl,
 * an der man merkt, ob es reicht.
 */
export function RoutinenListe({ ziele }: { ziele: RoutineZiel[] }) {
  return (
    <div className="space-y-4">
      {ziele.map((z) => <ZielKarte key={z.id} z={z} />)}
      <NeuesZiel />
    </div>
  );
}

function ZielKarte({ z }: { z: RoutineZiel }) {
  const [laeuft, start] = useTransition();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [titel, setTitel] = useState(z.titel);
  const [notiz, setNotiz] = useState(z.notiz);
  const [neu, setNeu] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const anzahl = proWoche(z);

  useEffect(() => { if (!bearbeiten) { setTitel(z.titel); setNotiz(z.notiz); } },
    [z.titel, z.notiz, bearbeiten]);

  const speichern = () => {
    setBearbeiten(false);
    start(async () => setFehler(await routineZielAendern(z.id, { titel, notiz })));
  };

  const hinzufuegen = () => {
    const t = neu.trim();
    if (!t) return;
    setNeu("");
    start(async () => {
      const f = await handlungAnlegen(z.id, t);
      setFehler(f);
      if (f) setNeu(t);
    });
  };

  return (
    <section className={cx("rounded-2xl border border-line/70 bg-card p-5 shadow-card",
      laeuft && "opacity-80")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">Ziel</p>
          {bearbeiten ? (
            <div className="mt-1 space-y-2">
              <input value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") speichern(); if (e.key === "Escape") setBearbeiten(false); }}
                className="w-full rounded-lg border border-line bg-field px-2.5 py-1.5 font-display
                           text-lg font-bold text-ink outline-none focus:border-accent" />
              <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2}
                placeholder="Warum ist dir das wichtig? (optional)"
                className="w-full resize-y rounded-lg border border-line bg-field px-2.5 py-1.5 text-sm
                           text-ink-soft outline-none placeholder:text-ink-faint focus:border-accent" />
              <div className="flex gap-2">
                <button type="button" onClick={speichern}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on">Speichern</button>
                <button type="button" onClick={() => setBearbeiten(false)}
                  className="rounded-lg bg-sand px-3 py-1.5 text-xs text-ink-soft">Abbrechen</button>
                <button type="button"
                  onClick={() => { if (confirm(`Ziel „${z.titel}" samt Handlungen löschen?`)) start(async () => { setFehler(await routineZielLoeschen(z.id)); }); }}
                  className="ml-auto rounded-lg px-2 py-1.5 text-xs text-bad-bright hover:bg-bad-tint">
                  Ziel löschen
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setBearbeiten(true)} className="mt-0.5 text-left"
              title="Bearbeiten">
              <span className="font-display text-xl font-bold leading-tight text-ink">{z.titel}</span>
              {z.notiz && <span className="mt-1 block whitespace-pre-line text-sm text-ink-muted">{z.notiz}</span>}
            </button>
          )}
        </div>

        <div className={cx("shrink-0 rounded-xl px-3 py-2 text-right",
          anzahl === 0 ? "bg-bad-tint" : anzahl < 3 ? "bg-warn-tint" : "bg-good-tint")}>
          <p className={cx("tabular font-display text-xl font-bold leading-none",
            anzahl === 0 ? "text-bad-bright" : anzahl < 3 ? "text-accent" : "text-good-bright")}>
            {anzahl}×
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-muted">pro Woche</p>
        </div>
      </div>

      <p className="mb-1 mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        Was ich dafür tue
      </p>
      {z.handlungen.length === 0 && (
        <p className="py-2 text-sm text-bad-bright">Noch nichts — ein Ziel ohne Handlung bleibt ein Wunsch.</p>
      )}
      <ul className="divide-y divide-line/60">
        {z.handlungen.map((h) => <HandlungZeile key={h.id} h={h} />)}
      </ul>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-line-strong
                      bg-field px-3 py-2">
        <span className="text-accent">+</span>
        <input value={neu} onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); hinzufuegen(); } }}
          placeholder="Was tust du dafür? z.B. Gym, gut essen … (Enter)"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" />
        {neu.trim() && (
          <button type="button" onClick={hinzufuegen}
            className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-ink-on">Hinzufügen</button>
        )}
      </div>
      {fehler && <p className="mt-2 text-xs text-bad-bright">{fehler}</p>}
    </section>
  );
}

function HandlungZeile({ h }: { h: Handlung }) {
  const [laeuft, start] = useTransition();
  const [titel, setTitel] = useState(h.titel);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => setTitel(h.titel), [h.titel]);

  const aendern = (felder: Parameters<typeof handlungAendern>[1]) =>
    start(async () => setFehler(await handlungAendern(h.id, felder)));

  const anzahl = istAnzahl(h);

  const tagUmschalten = (tag: number) =>
    aendern({ tage: h.tage.includes(tag) ? h.tage.filter((t) => t !== tag) : [...h.tage, tag] });

  return (
    <li className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5", laeuft && "opacity-60")}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)}
        onBlur={() => { if (titel.trim() && titel !== h.titel) aendern({ titel }); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="min-w-[10rem] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1
                   text-sm text-ink outline-none hover:border-line focus:border-accent focus:bg-field" />

      {/* Zwei Arten: feste Tage (Meal Prep am Sonntag) oder x-mal pro Woche,
          Tag egal (Gym 3×). Der Umschalter merkt sich nichts Kaputtes: beim
          Wechsel zurück auf feste Tage bleiben die alten Tage stehen. */}
      <div className="flex rounded-lg bg-sand p-0.5 text-[11px]">
        <button type="button" onClick={() => { if (anzahl) aendern({ proWoche: null }); }}
          className={cx("rounded-md px-2 py-1 transition", !anzahl ? "bg-card text-ink shadow-card" : "text-ink-faint hover:text-ink-soft")}>
          Feste Tage
        </button>
        <button type="button" onClick={() => { if (!anzahl) aendern({ proWoche: Math.max(1, h.tage.length || 3) }); }}
          className={cx("rounded-md px-2 py-1 transition", anzahl ? "bg-card text-ink shadow-card" : "text-ink-faint hover:text-ink-soft")}>
          x-mal pro Woche
        </button>
      </div>

      {anzahl ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-field">
            <button type="button" disabled={(h.pro_woche ?? 1) <= 1}
              onClick={() => aendern({ proWoche: (h.pro_woche ?? 1) - 1 })}
              className="h-7 w-7 text-ink-soft hover:text-ink disabled:opacity-30">−</button>
            <span className="tabular w-10 text-center text-sm text-ink">{h.pro_woche}×</span>
            <button type="button" disabled={(h.pro_woche ?? 1) >= 14}
              onClick={() => aendern({ proWoche: (h.pro_woche ?? 1) + 1 })}
              className="h-7 w-7 text-ink-soft hover:text-ink disabled:opacity-30">+</button>
          </div>
          {/* Wochenfortschritt: ein Punkt je geplantem Mal. */}
          <span className="flex items-center gap-1" title={`${h.erledigt.length} von ${h.pro_woche} diese Woche`}>
            {Array.from({ length: h.pro_woche ?? 0 }, (_, i) => (
              <span key={i} className={cx("h-2 w-2 rounded-full",
                i < h.erledigt.length ? "bg-good" : "border border-line-strong")} />
            ))}
            <span className="ml-1 text-[11px] text-ink-faint">{h.erledigt.length}/{h.pro_woche}</span>
          </span>
        </div>
      ) : (
        <div className="flex gap-0.5">
          {WOCHENTAGE.map((w) => (
            <button key={w.tag} type="button" onClick={() => tagUmschalten(w.tag)}
              className={cx("h-7 w-7 rounded-lg text-[11px] font-medium transition",
                h.tage.includes(w.tag) ? "bg-accent text-ink-on" : "bg-sand text-ink-faint hover:text-ink-soft")}>
              {w.kurz}
            </button>
          ))}
        </div>
      )}

      <label className="flex items-center gap-1.5 text-xs text-ink-muted"
        title={anzahl ? "Push täglich um diese Zeit, bis die Anzahl erreicht ist; leer = gesammelt um 07:00"
          : "Push-Erinnerung um diese Zeit; leer = gesammelt um 07:00"}>
        🔔
        <input type="time" value={h.uhrzeit ?? ""}
          onChange={(e) => aendern({ uhrzeit: e.target.value || null })}
          className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink outline-none
                     [color-scheme:dark] focus:border-accent" />
      </label>

      <button type="button" title="Handlung löschen"
        onClick={() => { if (confirm(`„${h.titel}" löschen?`)) start(async () => { setFehler(await handlungLoeschen(h.id)); }); }}
        className="rounded-lg px-2 py-1 text-xs text-ink-faint hover:bg-bad-tint hover:text-bad-bright">
        ✕
      </button>
      {fehler && <p className="w-full text-xs text-bad-bright">{fehler}</p>}
    </li>
  );
}

function NeuesZiel() {
  const [titel, setTitel] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  const anlegen = () => {
    const t = titel.trim();
    if (!t) return;
    setTitel("");
    start(async () => {
      const f = await routineZielAnlegen(t);
      setFehler(f);
      if (f) setTitel(t);
    });
  };

  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-4">
      <div className="flex items-center gap-2">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} disabled={laeuft}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); anlegen(); } }}
          placeholder="Neues Ziel, z.B. Fit sein"
          className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold text-ink outline-none
                     placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-ink-faint" />
        <button type="button" onClick={anlegen} disabled={!titel.trim() || laeuft}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-on disabled:opacity-40">
          Ziel hinzufügen
        </button>
      </div>
      {fehler && <p className="mt-2 text-xs text-bad-bright">{fehler}</p>}
    </div>
  );
}
