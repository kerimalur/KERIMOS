"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { MEAL_LABEL, MEAL_ORDER } from "@/lib/menu-labels";
import { setzeTrainingszeit } from "@/lib/essen-woche-actions";
import { TagMenue } from "@/components/essen/tag-menue";
import {
  slotZeiten, strahlPosition, zuUhrzeit, zuMinuten,
  STRAHL_VON, STRAHL_BIS,
  type EssenWoche, type WocheTag, type WocheMahlzeit,
} from "@/lib/essen-woche";

/**
 * Das Wochen-Whiteboard.
 *
 * Bewusst helle Fläche, obwohl KerimOS sonst dunkel ist: es soll sich wie
 * das Board an der Wand lesen, nicht wie eine weitere Karte in der App.
 * Deshalb stehen die Farben hier fest statt über die Tailwind-Tokens des
 * dunklen Themes - die sind für dunklen Grund gebaut und wären auf Weiss
 * unlesbar.
 *
 * Zwei Ansichten auf denselben Daten:
 *   Raster     - was gibt es, Slot für Slot. Zum Planen.
 *   Zeitstrahl - wann gibt es was, mit dem Training als Block dazwischen.
 */

const T = {
  grund: "#F7F4ED",
  heute: "#F0E6D2",
  linie: "#DED6C6",
  linieStark: "#C8BDA8",
  feld: "#FFFFFF",
  text: "#1C1711",
  soft: "#4A4136",
  muted: "#8A7D69",
  akzent: "#A2691F",
  akzentGrund: "#F0E2CB",
  gut: "#2E7D5F",
};

export function EssenWhiteboard({ woche }: { woche: EssenWoche }) {
  const [ansicht, setAnsicht] = useState<"raster" | "strahl">("raster");
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [vollbild, setVollbild] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // Der Vollbild-Zustand kann auch ausserhalb der App enden (Escape, Geste),
  // deshalb wird er am Browser abgehört statt nur beim Klick gesetzt.
  useEffect(() => {
    const zuhoerer = () => setVollbild(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", zuhoerer);
    return () => document.removeEventListener("fullscreenchange", zuhoerer);
  }, []);

  async function vollbildUmschalten() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      // Manche Browser verweigern Vollbild ohne direkte Geste - dann bleibt
      // das Board schlicht in Normalgrösse, statt einen Fehler zu werfen.
    }
  }

  const geplant = woche.tage.filter((t) => t.mahlzeiten.length > 0).length;

  return (
    <div ref={boardRef}
      className={cx("rounded-2xl", vollbild && "overflow-auto rounded-none")}
      style={{ background: T.grund, color: T.text }}>
      <div className={cx("mx-auto", vollbild && "max-w-6xl px-2 py-4")}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <div>
            <div className="font-display text-lg font-bold" style={{ color: T.text }}>
              Diese Woche
            </div>
            <p className="mt-0.5 text-xs" style={{ color: T.muted }}>
              {geplant === 7 ? "Alle sieben Tage stehen." : `${geplant} von 7 Tagen geplant.`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl p-1" style={{ background: T.heute }}>
              {([["raster", "Raster"], ["strahl", "Zeitstrahl"]] as const).map(([wert, label]) => (
                <button key={wert} type="button" onClick={() => setAnsicht(wert)}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-medium transition"
                  style={ansicht === wert
                    ? { background: T.feld, color: T.text }
                    : { color: T.soft }}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={vollbildUmschalten}
              title={vollbild ? "Vollbild verlassen" : "Vollbild"}
              className="rounded-xl px-3 py-2 text-sm font-medium transition"
              style={{ background: T.heute, color: T.soft }}>
              {vollbild ? "Schliessen" : "Vollbild"}
            </button>
          </div>
        </div>

        {ansicht === "raster"
          ? <Raster woche={woche} bearbeitet={bearbeitet} setBearbeitet={setBearbeitet} />
          : <Zeitstrahl woche={woche} bearbeitet={bearbeitet} setBearbeitet={setBearbeitet} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ gemeinsame Teile */

/** Der Tag danach - Vorschlag fuers Zielfeld beim Verschieben. */
function folgetag(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TagKopf({ tag, onEdit }: { tag: WocheTag; onEdit: () => void }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-base font-bold"
          style={{ color: tag.istHeute ? T.akzent : tag.istVergangen ? T.muted : T.text }}>
          {tag.kurz}
        </span>
        <span className="tabular text-[11px]" style={{ color: T.muted }}>
          {tag.datum.slice(8, 10)}.{tag.datum.slice(5, 7)}.
        </span>
        <span className="ml-auto">
          <TagMenue datum={tag.datum} standardZiel={folgetag(tag.datum)}
            mahlzeiten={tag.mahlzeiten
              .filter((m) => m.id)
              .map((m) => ({
                id: m.id, meal_type: m.meal_type, name: m.name, kcal: m.kcal,
              }))} />
        </span>
      </div>
      <button type="button" onClick={onEdit}
        className="mt-1 rounded-lg px-1.5 py-0.5 text-[11px] transition"
        style={tag.training
          ? { background: T.akzentGrund, color: T.akzent }
          : { color: T.muted }}>
        {tag.training ? `Training ${tag.training}` : "+ Training"}
      </button>
    </div>
  );
}

function TrainingForm({ tag, onFertig }: { tag: WocheTag; onFertig: () => void }) {
  const feld = {
    background: T.feld, color: T.text, border: `1px solid ${T.linie}`,
  };
  return (
    <form action={(fd) => { setzeTrainingszeit(fd); onFertig(); }}
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: T.heute }}>
      <input type="hidden" name="datum" value={tag.datum} />
      <input type="time" name="zeit" defaultValue={tag.training ?? ""}
        aria-label="Trainingszeit"
        className="rounded-lg px-2 py-1 text-xs" style={feld} />
      <input name="notiz" defaultValue={tag.trainingNotiz ?? ""} placeholder="Notiz"
        aria-label="Notiz"
        className="w-28 rounded-lg px-2 py-1 text-xs" style={feld} />
      <button type="submit" className="text-xs font-medium transition hover:underline"
        style={{ color: T.akzent }}>
        Speichern
      </button>
      <button type="button" onClick={onFertig} className="text-xs transition"
        style={{ color: T.muted }}>
        Abbrechen
      </button>
      <span className="text-[11px]" style={{ color: T.muted }}>
        Leer lassen = kein Training
      </span>
    </form>
  );
}

function Summe({ tag, woche }: { tag: WocheTag; woche: EssenWoche }) {
  if (tag.mahlzeiten.length === 0) {
    return <span className="text-xs" style={{ color: T.muted }}>offen</span>;
  }
  const proteinOk = tag.protein >= woche.zielProtein;
  return (
    <span className="tabular whitespace-nowrap text-xs" style={{ color: T.soft }}>
      {Math.round(tag.kcal)}<span style={{ color: T.muted }}> kcal · </span>
      <span style={{ color: proteinOk ? T.gut : T.soft }}>{Math.round(tag.protein)} g</span>
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
      <div className="hidden grid-cols-[5.5rem_repeat(4,1fr)_5rem] gap-3 pb-2 sm:grid">
        <span />
        {MEAL_ORDER.map((slot) => (
          <span key={slot} className="text-[11px] uppercase tracking-[0.1em]"
            style={{ color: T.muted }}>
            {MEAL_LABEL[slot]}
          </span>
        ))}
        <span />
      </div>

      {woche.tage.map((tag) => (
        <div key={tag.datum} className="py-3"
          style={{
            borderTop: `1px solid ${T.linie}`,
            background: tag.istHeute ? T.heute : undefined,
          }}>
          <div className="grid gap-3 sm:grid-cols-[5.5rem_repeat(4,1fr)_5rem]">
            <TagKopf tag={tag}
              onEdit={() => setBearbeitet(bearbeitet === tag.datum ? null : tag.datum)} />

            {MEAL_ORDER.map((slot) => {
              const treffer = tag.mahlzeiten.filter((m) => m.meal_type === slot);
              return (
                <div key={slot} className="min-w-0">
                  <span className="text-[11px] uppercase tracking-[0.1em] sm:hidden"
                    style={{ color: T.muted }}>
                    {MEAL_LABEL[slot]}
                  </span>
                  {treffer.length === 0 ? (
                    <span className="text-sm" style={{ color: T.linieStark }}>—</span>
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
    <div className={cx("text-sm leading-snug", m.eaten && "line-through")}
      style={{ color: m.eaten ? T.muted : T.soft }}>
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
  const marken: number[] = [];
  for (let m = STRAHL_VON; m <= STRAHL_BIS; m += 180) marken.push(m);

  return (
    <div className="mt-4 px-6 pb-5">
      <div className="hidden grid-cols-[5.5rem_1fr] gap-3 pb-1 sm:grid">
        <span />
        <div className="relative h-4">
          {marken.map((m) => (
            <span key={m} className="tabular absolute -translate-x-1/2 text-[11px]"
              style={{ left: `${strahlPosition(m)}%`, color: T.muted }}>
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
          return { m, minute: (zeiten[m.meal_type] ?? 12 * 60) + n * 25 };
        }).sort((a, b) => a.minute - b.minute);

        return (
          <div key={tag.datum} className="py-3"
            style={{
              borderTop: `1px solid ${T.linie}`,
              background: tag.istHeute ? T.heute : undefined,
            }}>
            <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
              <TagKopf tag={tag}
                onEdit={() => setBearbeitet(bearbeitet === tag.datum ? null : tag.datum)} />

              <div className="relative" style={{ minHeight: punkte.length > 1 ? 84 : 56 }}>
                {marken.map((m) => (
                  <div key={m} className="absolute inset-y-0 w-px"
                    style={{ left: `${strahlPosition(m)}%`, background: T.linie }} />
                ))}

                {trainingMin !== null && (
                  <div className="absolute top-0 h-6 rounded-lg px-2 text-[11px] leading-6"
                    style={{
                      left: `${strahlPosition(trainingMin)}%`,
                      background: T.akzentGrund, color: T.akzent,
                    }}>
                    Training {tag.training}
                  </div>
                )}

                {punkte.length === 0 ? (
                  <span className="absolute top-1 text-sm" style={{ color: T.linieStark }}>
                    nichts geplant
                  </span>
                ) : punkte.map(({ m, minute }, i) => {
                  const pos = strahlPosition(minute);
                  // Ab zwei Dritteln nach links ausrichten, sonst schiebt sich
                  // eine späte Mahlzeit über den rechten Rand hinaus.
                  const spaet = pos > 66;
                  return (
                    <div key={i}
                      className={cx("absolute whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px]",
                        m.eaten && "line-through")}
                      style={{
                        ...(spaet ? { right: `${100 - pos}%` } : { left: `${pos}%` }),
                        top: i % 2 === 0 ? 28 : 52,
                        background: T.feld,
                        border: `1px solid ${T.linie}`,
                        color: m.eaten ? T.muted : T.soft,
                      }}
                      title={`${zuUhrzeit(minute)} · ${Math.round(m.kcal)} kcal · ${Math.round(m.protein)} g Protein`}>
                      <span className="tabular mr-1" style={{ color: T.muted }}>
                        {zuUhrzeit(minute)}
                      </span>
                      {m.name}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-1 text-right"><Summe tag={tag} woche={woche} /></div>

            {bearbeitet === tag.datum && (
              <TrainingForm tag={tag} onFertig={() => setBearbeitet(null)} />
            )}
          </div>
        );
      })}

      <p className="mt-3 pt-3 text-[11px]"
        style={{ borderTop: `1px solid ${T.linie}`, color: T.muted }}>
        Die Uhrzeiten folgen deinen Essensmustern und richten sich nach der
        Trainingszeit — sie sind nicht pro Mahlzeit erfasst.
      </p>
    </div>
  );
}
