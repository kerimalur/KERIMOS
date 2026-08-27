"use client";
import { useEffect, useRef, useState } from "react";
import { cx, inputClass } from "@/components/ui";
import {
  MONATE_KURZ, WOCHENTAGE_KURZ, alsDeutsch, alsIso, ersterWochentag,
  istWochenende, parseDatum, tageImMonat, verschiebeTage,
} from "@/lib/datum-eingabe";

/**
 * Datum eingeben statt suchen.
 *
 * Der Kalender des Browsers macht beim heutigen Tag auf, klappt nach jeder
 * Auswahl zu und verlangt für einen Trade aus dem März 2022 ein Dutzend
 * Klicks. Beim Backtesten ist das die grösste einzelne Zeitausgabe des
 * Abends — und sie erzeugt keinen einzigen Datensatz.
 *
 * Drei Wege, alle gleichwertig:
 *
 * 1. **Tippen.** `12.3.22`, `120322`, `12.3.` — der Parser nimmt alles.
 * 2. **Pfeile** für einen Tag vor oder zurück.
 * 3. **Das Raster:** zwölf Monatskästchen, darunter die Tage.
 *
 * Das Entscheidende steht in der Zustandsführung: **Jahr und Monat bleiben
 * stehen, wenn ein Tag gewählt wird.** Wer zwanzig Trades aus dem März 2022
 * erfasst, klickt zwanzigmal genau einmal. Ins nächste Jahr geht es nur auf
 * ausdrücklichen Klick — versehentlich springt hier nichts.
 */
export function DatumWaehler({
  id, name, standard, required = true, raster = true,
}: {
  id?: string;
  name: string;
  /** ISO-Datum, mit dem das Feld aufmacht. */
  standard: string;
  required?: boolean;
  /**
   * Das Monats- und Tagesraster. Aus, wo das Datum einmal und nicht fünfzigmal
   * eingegeben wird — beim Anlegen einer Session etwa reicht das Tippfeld.
   */
  raster?: boolean;
}) {
  const [wert, setWert] = useState(standard);
  const [text, setText] = useState(() => alsDeutsch(standard));
  const [jahr, setJahr] = useState(() => Number(standard.slice(0, 4)) || new Date().getUTCFullYear());
  const [monat, setMonat] = useState(() => Number(standard.slice(5, 7)) || 1);
  const [fehler, setFehler] = useState(false);

  // Wechselt die Vorgabe (nach dem Speichern zeigt sie auf den neuen letzten
  // Trade), zieht das Feld mit. Ohne das stünde nach dem Speichern noch das
  // Datum von vorletzter Woche da.
  const vorher = useRef(standard);
  useEffect(() => {
    if (vorher.current === standard) return;
    vorher.current = standard;
    setWert(standard);
    setText(alsDeutsch(standard));
    setFehler(false);
    if (standard) {
      setJahr(Number(standard.slice(0, 4)));
      setMonat(Number(standard.slice(5, 7)));
    }
  }, [standard]);

  /** Wert setzen und das Raster mitnehmen. */
  function waehle(iso: string) {
    setWert(iso);
    setText(alsDeutsch(iso));
    setFehler(false);
    setJahr(Number(iso.slice(0, 4)));
    setMonat(Number(iso.slice(5, 7)));
  }

  function tippen(roh: string) {
    setText(roh);
    const gelesen = parseDatum(roh, jahr);
    if (gelesen) {
      setWert(gelesen);
      setFehler(false);
      // Das Raster folgt der Eingabe, damit man sieht, wo man gelandet ist.
      setJahr(Number(gelesen.slice(0, 4)));
      setMonat(Number(gelesen.slice(5, 7)));
    } else {
      setFehler(roh.trim() !== "");
    }
  }

  const schieben = (n: number) => {
    if (!wert) return;
    waehle(verschiebeTage(wert, n));
  };

  const tage = tageImMonat(jahr, monat);
  const leerVorne = ersterWochentag(jahr, monat);
  const wochenende = wert !== "" && istWochenende(wert);
  const wochentag = wert === ""
    ? ""
    : WOCHENTAGE_KURZ[(new Date(`${wert}T12:00:00Z`).getUTCDay() + 6) % 7];

  return (
    <div>
      <input type="hidden" name={name} value={wert} />

      <div className="flex flex-wrap items-center gap-1.5">
        <input id={id} inputMode="numeric" autoComplete="off" spellCheck={false}
          value={text} onChange={(e) => tippen(e.target.value)}
          onBlur={() => { if (fehler) { setText(alsDeutsch(wert)); setFehler(false); } }}
          onKeyDown={(e) => {
            // Enter soll das Datum übernehmen, nicht das halbe Formular abschicken.
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "ArrowUp") { e.preventDefault(); schieben(1); }
            if (e.key === "ArrowDown") { e.preventDefault(); schieben(-1); }
          }}
          placeholder="12.3.22"
          aria-invalid={fehler}
          className={cx(inputClass, "w-32 tabular",
            fehler && "border-bad text-bad")} />

        <button type="button" onClick={() => schieben(-1)} aria-label="Ein Tag zurück"
          className="rounded-lg border border-line bg-sand px-2.5 py-2 text-xs text-ink-muted
                     transition hover:text-ink active:scale-95">←</button>
        <button type="button" onClick={() => schieben(1)} aria-label="Ein Tag vor"
          className="rounded-lg border border-line bg-sand px-2.5 py-2 text-xs text-ink-muted
                     transition hover:text-ink active:scale-95">→</button>

        {wert && (
          <span className={cx("text-xs", wochenende ? "font-medium text-bad" : "text-ink-muted")}>
            {wochentag}{wochenende && " — Wochenende, da läuft kein Markt"}
          </span>
        )}
        {fehler && (
          <span className="text-xs text-bad">
            nicht lesbar — z. B. 12.3.22, 120322 oder 2022-03-12
          </span>
        )}
      </div>

      {raster && (
      <div className="mt-2 rounded-xl border border-line bg-sand/40 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setJahr((j) => j - 1)} aria-label="Jahr zurück"
            className="rounded-lg px-2 py-1 text-xs text-ink-muted transition
                       hover:bg-sand hover:text-ink active:scale-95">←</button>
          <span className="tabular text-sm font-medium text-ink">{jahr}</span>
          <button type="button" onClick={() => setJahr((j) => j + 1)} aria-label="Jahr vor"
            className="rounded-lg px-2 py-1 text-xs text-ink-muted transition
                       hover:bg-sand hover:text-ink active:scale-95">→</button>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {MONATE_KURZ.map((m, i) => (
            <button key={m} type="button" onClick={() => setMonat(i + 1)}
              className={cx("rounded-lg py-1 text-xs transition duration-150 ease-tactile active:scale-95",
                monat === i + 1
                  ? "bg-accent font-medium text-ink-on"
                  : "text-ink-muted hover:bg-sand hover:text-ink")}>
              {m}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 border-t border-line pt-2">
          {WOCHENTAGE_KURZ.map((w) => (
            <span key={w} className={cx("pb-0.5 text-center text-[10px]",
              w === "Sa" || w === "So" ? "text-ink-faint/50" : "text-ink-faint")}>
              {w}
            </span>
          ))}
          {Array.from({ length: leerVorne }, (_, i) => <span key={`leer${i}`} />)}
          {Array.from({ length: tage }, (_, i) => {
            const tag = i + 1;
            const iso = alsIso(jahr, monat, tag);
            const frei = istWochenende(iso);
            const gewaehlt = iso === wert;
            return (
              <button key={tag} type="button" onClick={() => waehle(iso)}
                className={cx(
                  "num rounded-lg py-1 text-xs transition duration-150 ease-tactile active:scale-95",
                  gewaehlt ? "bg-accent font-medium text-ink-on"
                    : frei ? "text-ink-faint/45 hover:bg-sand hover:text-ink-muted"
                      : "text-ink-soft hover:bg-sand hover:text-ink")}>
                {tag}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {required && wert === "" && (
        <p className="mt-1 text-[11px] text-bad">Ohne Datum lässt sich nichts speichern.</p>
      )}
    </div>
  );
}
