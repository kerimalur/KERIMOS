"use client";
import { useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER } from "@/lib/menu-labels";
import { setzeTrainingszeit } from "@/lib/essen-woche-actions";
import {
  slotZeiten, strahlPosition, zuUhrzeit, zuMinuten,
  STRAHL_VON, STRAHL_BIS,
  type EssenWoche, type WocheTag, type WocheMahlzeit,
} from "@/lib/essen-woche";

/**
 * Das Wochen-Whiteboard.
 *
 * Kein Karten-Layout: eine durchgehende Fläche, Tage nur durch Striche
 * getrennt, viel Luft und grosse Schrift. Es soll sich lesen wie das Board
 * an der Wand - ein Blick genügt, um zu wissen, dass die Woche steht.
 *
 * Zwei Ansichten auf denselben Daten:
 *   Raster     - was gibt es, Slot für Slot. Zum Planen.
 *   Zeitstrahl - wann gibt es was, mit dem Training als Block dazwischen.
 *                Beantwortet "was esse ich vor und nach dem Training".
 */
export function EssenWhiteboard({ woche }: { woche: EssenWoche }) {
  const [ansicht, setAnsicht] = useState<"raster" | "strahl">("raster");
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);

  const geplant = woche.tage.filter((t) => t.mahlzeiten.length > 0).length;

  return (
    <div className="rounded-2xl border border-line/70 bg-card">
      {/* Kopf: Umschalter und der eine Satz, der die Woche zusammenfasst */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
        <div>
          <div className="font-display text-lg font-bold text-ink">Diese Woche</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {geplant === 7
              ? "Alle sieben Tage stehen."
              : `${geplant} von 7 Tagen geplant.`}
          </p>
        </div>
        <div className="flex rounded-xl bg-sand p-1">
          {([["raster", "Raster"], ["strahl", "Zeitstrahl"]] as const).map(([wert, label]) => (
            <button key={wert} type="button" onClick={() => setAnsicht(wert)}
              className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                ansicht === wert ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {ansicht === "raster"
        ? <Raster woche={woche} bearbeitet={bearbeitet} setBearbeitet={setBearbeitet} />
        : <Zeitstrahl woche={woche} bearbeitet={bearbeitet} setBearbeitet={setBearbeitet} />}
    </div>
  );
}

/* ------------------------------------------------------------ gemeinsame Teile */

/** Tagesspalte links: Kürzel, Datum, Trainingsmarke. Überall gleich. */
function TagKopf({
  tag, onEdit,
}: { tag: WocheTag; onEdit: () => void }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className={cx("font-display text-base font-bold",
          tag.istHeute ? "text-accent" : tag.istVergangen ? "text-ink-faint" : "text-ink")}>
          {tag.kurz}
        </span>
        <span className="tabular text-[11px] text-ink-faint">
          {tag.datum.slice(8, 10)}.{tag.datum.slice(5, 7)}.
        </span>
      </div>
      <button type="button" onClick={onEdit}
        className={cx("mt-1 rounded-lg px-1.5 py-0.5 text-[11px] transition",
          tag.training
            ? "bg-accent-tint text-accent-soft hover:bg-accent/20"
            : "text-ink-faint hover:text-ink-muted")}>
        {tag.training ? `Training ${tag.training}` : "+ Training"}
      </button>
    </div>
  );
}

/** Kleines Formular, das unter dem Tag aufklappt. */
function TrainingForm({ tag, onFertig }: { tag: WocheTag; onFertig: () => void }) {
  return (
    <form action={(fd) => { setzeTrainingszeit(fd); onFertig(); }}
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-sand/70 px-3 py-2">
      <input type="hidden" name="datum" value={tag.datum} />
      <input type="time" name="zeit" defaultValue={tag.training ?? ""}
        aria-label="Trainingszeit"
        className="rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink" />
      <input name="notiz" defaultValue={tag.trainingNotiz ?? ""} placeholder="Notiz"
        aria-label="Notiz"
        className="w-28 rounded-lg border border-line bg-field px-2 py-1 text-xs text-ink" />
      <button type="submit"
        className="text-xs text-accent-soft transition hover:underline">
        Speichern
      </button>
      <button type="button" onClick={onFertig}
        className="text-xs text-ink-faint transition hover:text-ink-muted">
        Abbrechen
      </button>
      <span className="text-[11px] text-ink-faint">Leer lassen = kein Training</span>
    </form>
  );
}

/** Tagessumme rechts. Grau, wenn nichts geplant ist. */
function Summe({ tag, woche }: { tag: WocheTag; woche: EssenWoche }) {
  if (tag.mahlzeiten.length === 0) {
    return <span className="text-xs text-ink-faint">offen</span>;
  }
  const proteinOk = tag.protein >= woche.zielProtein;
  return (
    <span className="tabular text-xs text-ink-muted">
      {Math.round(tag.kcal)}
      <span className="text-ink-faint"> kcal · </span>
      <span className={proteinOk ? "text-good" : "text-ink-muted"}>
        {Math.round(tag.protein)} g
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- Raster */

function Raster({
  woche, bearbeitet, setBearbeitet,
}: {
  woche: EssenWoche;
  bearbeitet: string | null;
  setBearbeitet: (d: string | null) => void;
}) {
  return (
    <div className="mt-4 px-6 pb-5">
      {/* Spaltenköpfe - auf dem Handy weggelassen, dort steht der Slot an
          der Mahlzeit selbst */}
      <div className="hidden grid-cols-[5.5rem_repeat(4,1fr)_4.5rem] gap-3 pb-2 sm:grid">
        <span />
        {MEAL_ORDER.map((slot) => (
          <span key={slot} className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
            {MEAL_LABEL[slot]}
          </span>
        ))}
        <span />
      </div>

      {woche.tage.map((tag) => (
        <div key={tag.datum}
          className={cx("border-t border-line/70 py-3",
            tag.istHeute && "bg-accent-tint/30")}>
          <div className="grid gap-3 sm:grid-cols-[5.5rem_repeat(4,1fr)_4.5rem]">
            <TagKopf tag={tag}
              onEdit={() => setBearbeitet(bearbeitet === tag.datum ? null : tag.datum)} />

            {MEAL_ORDER.map((slot) => {
              const treffer = tag.mahlzeiten.filter((m) => m.meal_type === slot);
              return (
                <div key={slot} className="min-w-0">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint sm:hidden">
                    {MEAL_LABEL[slot]}
                  </span>
                  {treffer.length === 0 ? (
                    <span className="text-sm text-ink-faint">—</span>
                  ) : (
                    treffer.map((m, i) => <MahlzeitText key={i} m={m} />)
                  )}
                </div>
              );
            })}

            <div className="text-right"><Summe tag={tag} woche={woche} /></div>
          </div>

          {bearbeitet === tag.datum && (
            <TrainingForm tag={tag} onFertig={() => setBearbeitet(null)} />
          )}
        </div>
      ))}
    </div>
  );
}

function MahlzeitText({ m }: { m: WocheMahlzeit }) {
  return (
    <div className={cx("text-sm leading-snug",
      m.eaten ? "text-ink-faint line-through" : "text-ink-soft")}>
      {m.name}
    </div>
  );
}

/* -------------------------------------------------------------- Zeitstrahl */

function Zeitstrahl({
  woche, bearbeitet, setBearbeitet,
}: {
  woche: EssenWoche;
  bearbeitet: string | null;
  setBearbeitet: (d: string | null) => void;
}) {
  // Volle Stunden als Raster im Hintergrund, alle drei Stunden beschriftet.
  const marken: number[] = [];
  for (let m = STRAHL_VON; m <= STRAHL_BIS; m += 180) marken.push(m);

  return (
    <div className="mt-4 px-6 pb-5">
      <div className="hidden grid-cols-[5.5rem_1fr] gap-3 pb-1 sm:grid">
        <span />
        <div className="relative h-4">
          {marken.map((m) => (
            <span key={m} className="tabular absolute -translate-x-1/2 text-[11px] text-ink-faint"
              style={{ left: `${strahlPosition(m)}%` }}>
              {zuUhrzeit(m).slice(0, 2)}
            </span>
          ))}
        </div>
      </div>

      {woche.tage.map((tag) => {
        const zeiten = slotZeiten(tag.training);
        const trainingMin = zuMinuten(tag.training);

        // Mehrere Mahlzeiten im selben Slot teilen sich eine Zeit - damit sie
        // sich nicht überdecken, werden sie um je 25 Minuten versetzt.
        const proSlot = new Map<string, number>();
        const punkte = tag.mahlzeiten.map((m) => {
          const n = proSlot.get(m.meal_type) ?? 0;
          proSlot.set(m.meal_type, n + 1);
          const basis = zeiten[m.meal_type] ?? 12 * 60;
          return { m, minute: basis + n * 25 };
        }).sort((a, b) => a.minute - b.minute);

        return (
          <div key={tag.datum}
            className={cx("border-t border-line/70 py-3",
              tag.istHeute && "bg-accent-tint/30")}>
            <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
              <TagKopf tag={tag}
                onEdit={() => setBearbeitet(bearbeitet === tag.datum ? null : tag.datum)} />

              <div className="relative min-h-[2.75rem]">
                {/* Stundenraster */}
                {marken.map((m) => (
                  <div key={m} className="absolute inset-y-0 w-px bg-line/60"
                    style={{ left: `${strahlPosition(m)}%` }} />
                ))}

                {trainingMin !== null && (
                  <div className="absolute top-0 h-6 rounded-lg bg-accent/25 px-2
                                  text-[11px] leading-6 text-accent-soft"
                    style={{ left: `${strahlPosition(trainingMin)}%` }}>
                    Training {tag.training}
                  </div>
                )}

                {punkte.length === 0 ? (
                  <span className="absolute top-1 text-sm text-ink-faint">
                    nichts geplant
                  </span>
                ) : punkte.map(({ m, minute }, i) => {
                  const pos = strahlPosition(minute);
                  // Ab zwei Dritteln nach links ausrichten, sonst schiebt
                  // sich eine späte Mahlzeit über den rechten Rand hinaus.
                  const spaet = pos > 66;
                  return (
                    <div key={i}
                      className={cx(
                        "absolute whitespace-nowrap rounded-lg border border-line bg-sand/80",
                        "px-1.5 py-0.5 text-[11px]",
                        m.eaten ? "text-ink-faint line-through" : "text-ink-soft",
                        // Versetzt stapeln, damit sich nichts überlagert
                        i % 2 === 0 ? "top-7" : "top-[3.25rem]")}
                      style={spaet
                        ? { right: `${100 - pos}%` }
                        : { left: `${pos}%` }}
                      title={`${zuUhrzeit(minute)} · ${Math.round(m.kcal)} kcal · ${Math.round(m.protein)} g Protein`}>
                      <span className="tabular mr-1 text-ink-faint">{zuUhrzeit(minute)}</span>
                      {m.name}
                    </div>
                  );
                })}

                <div className={cx("absolute right-0",
                  punkte.length > 1 ? "top-[4.75rem]" : "top-7")}>
                  <Summe tag={tag} woche={woche} />
                </div>
              </div>
            </div>

            {/* Platz für die versetzt gestapelten Marken */}
            <div className={punkte.length > 1 ? "h-16" : "h-6"} />

            {bearbeitet === tag.datum && (
              <TrainingForm tag={tag} onFertig={() => setBearbeitet(null)} />
            )}
          </div>
        );
      })}

      <p className="mt-3 border-t border-line/70 pt-3 text-[11px] text-ink-faint">
        Die Uhrzeiten folgen deinen Essensmustern und richten sich nach der
        Trainingszeit — sie sind nicht pro Mahlzeit erfasst.{" "}
        <Link href="/m/Essen/mehr" className="text-accent-soft hover:underline">
          Muster ansehen ↗
        </Link>
      </p>
    </div>
  );
}
