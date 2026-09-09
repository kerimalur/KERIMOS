"use client";

import { useState, useTransition } from "react";
// Der Dialog liegt unter trading/, ist aber nicht trading-spezifisch: dort
// steckt die Lehre, dass `position: fixed` unter einem transformierten
// Vorfahren nicht mehr den Bildschirm meint — deshalb das Portal. Neu
// nachbauen hiesse, denselben Fehler ein zweites Mal zu machen.
import { Modal, ModalKopf } from "@/components/trading/modal";
import { gewohnheitAbhaken } from "@/lib/gewohnheiten-actions";
import type { GewohnheitStand } from "@/lib/gewohnheiten";
import { cx } from "@/components/ui";
import { addDays, dayNameShort } from "@/lib/time";

/**
 * „Wann war das?" — der Dialog für Gewohnheiten mit Datum und Varianten.
 *
 * Ein Training hakt man nicht ab, während man es macht. Man trägt es abends
 * nach, manchmal übermorgen, und dann ist „heute" die falsche Antwort. Wer
 * jeden Eintrag still auf heute bucht, hat nach zwei Wochen eine Zahl, der er
 * nicht mehr glaubt — und ab da schaut er nicht mehr hin.
 *
 * Deshalb zuerst der Tag, dann die Variante. Beides in einem Schritt: Push
 * am Montag ist eine Aussage, nicht zwei.
 *
 * Der Dialog bleibt nach dem Eintragen offen. Kraft am Morgen und Ausdauer am
 * Abend sind zwei Einheiten desselben Tages, und wer sie beide nachträgt,
 * soll nicht zweimal denselben Weg gehen.
 */
export function GewohnheitenDialog({
  h, heute, kind,
}: {
  h: GewohnheitStand;
  /** Heutiges Datum vom Server — der Browser kann in einer anderen Zone stehen. */
  heute: string;
  /** Der Knopf, der den Dialog öffnet. */
  kind: React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [datum, setDatum] = useState(heute);
  const [pending, start] = useTransition();

  /** Die letzten sieben Tage als Schnellwahl — weiter zurück über das Feld. */
  const letzteTage = Array.from({ length: 7 }, (_, i) => addDays(heute, -i));

  const amTag = h.eintraege.filter((e) => e.datum === datum);
  const hatVariante = (v: string | null) =>
    amTag.some((e) => (e.variante ?? null) === v);

  function schalten(variante: string | null) {
    const fd = new FormData();
    fd.set("id", h.id);
    fd.set("datum", datum);
    if (variante) fd.set("variante", variante);
    // Leerer Wert heisst „wieder wegnehmen".
    fd.set("getan", hatVariante(variante) ? "" : "1");
    start(async () => { await gewohnheitAbhaken(fd); });
  }

  const tagLabel = (d: string) =>
    d === heute ? "Heute"
      : d === addDays(heute, -1) ? "Gestern"
        : `${dayNameShort(d)} ${Number(d.slice(8, 10))}.`;

  return (
    <>
      <button type="button" onClick={() => { setDatum(heute); setOffen(true); }}
        className="w-full text-left">
        {kind}
      </button>

      <Modal offen={offen} schliessen={() => setOffen(false)} breite="max-w-md">
        <ModalKopf schliessen={() => setOffen(false)}>
          <span className="font-display text-base font-bold text-ink">
            {h.icon && <span className="mr-2">{h.icon}</span>}
            {h.name}
          </span>
        </ModalKopf>

        <div className="space-y-5 px-5 py-5">
          {/* ---------------------------------------------------- Wann */}
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase
                            tracking-[0.12em] text-ink-muted">
              Wann
            </div>
            <div className="flex flex-wrap gap-1.5">
              {letzteTage.map((d) => (
                <button key={d} type="button" onClick={() => setDatum(d)}
                  className={cx(
                    "rounded-xl px-3 py-1.5 text-sm transition duration-150",
                    "ease-tactile active:scale-95",
                    d === datum
                      ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                      : "border border-line bg-sand text-ink-soft hover:border-line-strong")}>
                  {tagLabel(d)}
                </button>
              ))}
            </div>
            <label className="mt-2.5 flex items-center gap-2 text-xs text-ink-muted">
              länger her
              <input type="date" value={datum} max={heute}
                onChange={(e) => e.target.value && setDatum(e.target.value)}
                className="rounded-xl border border-line bg-card px-2.5 py-1.5
                           text-sm text-ink" />
            </label>
          </div>

          {/* ------------------------------------------------- Was genau */}
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase
                            tracking-[0.12em] text-ink-muted">
              {h.varianten.length > 0 ? "Was" : "Eintragen"}
            </div>

            {h.varianten.length === 0 ? (
              <button type="button" disabled={pending} onClick={() => schalten(null)}
                className={cx(
                  "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition",
                  "duration-150 ease-tactile active:scale-[0.98] disabled:opacity-50",
                  hatVariante(null)
                    ? "border border-good/50 bg-good-tint text-good-bright"
                    : "bg-accent text-ink-on shadow-glow-accent")}>
                {hatVariante(null)
                  ? `✓ ${tagLabel(datum)} eingetragen — nochmal drücken zum Entfernen`
                  : `${tagLabel(datum)} eintragen`}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {h.varianten.map((v) => {
                  const drin = hatVariante(v);
                  return (
                    <button key={v} type="button" disabled={pending}
                      onClick={() => schalten(v)}
                      style={drin ? { background: h.farbe, borderColor: h.farbe } : undefined}
                      className={cx(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                        "duration-150 ease-tactile active:scale-[0.97] disabled:opacity-50",
                        drin
                          ? "text-white shadow-sm"
                          : "border-line bg-sand text-ink-soft hover:border-line-strong")}>
                      {drin && <span className="mr-1.5">✓</span>}
                      {v}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-2 text-[11px] text-ink-faint">
              {amTag.length === 0
                ? `Für ${tagLabel(datum).toLowerCase()} steht noch nichts.`
                : `${tagLabel(datum)}: ${amTag
                    .map((e) => e.variante ?? "eingetragen").join(", ")}`}
              {h.varianten.length > 0 &&
                " — mehrere an einem Tag sind erlaubt, nochmal drücken nimmt wieder weg."}
            </p>
          </div>

          <button type="button" onClick={() => setOffen(false)}
            className="w-full rounded-xl border border-line bg-card px-4 py-2
                       text-sm text-ink-soft transition hover:border-line-strong
                       active:scale-[0.98]">
            Fertig
          </button>
        </div>
      </Modal>
    </>
  );
}
