"use client";

import { useState, useTransition } from "react";
// Der Dialog liegt unter trading/, ist aber nicht trading-spezifisch: dort
// steckt die Lehre, dass `position: fixed` unter einem transformierten
// Vorfahren nicht mehr den Bildschirm meint — deshalb das Portal.
import { Modal, ModalKopf } from "@/components/trading/modal";
import { aufgabeAnlegen, projektAnlegen } from "@/lib/planung-actions";
import { KATEGORIEN, type Projekt } from "@/lib/planung-typen";
import { Button, Input, Label, Select, cx } from "@/components/ui";

/**
 * Anlegen passiert IN der Box, nicht in einer zweiten daneben.
 *
 * Vorher stand unter jeder Liste eine eigene Karte „Neu" mit dem Formular.
 * Zwei Karten für eine Sache: die eine zeigt, was da ist, die andere nimmt
 * entgegen — und die zweite steht auch dann herum, wenn man nichts anlegen
 * will, also fast immer. Das Formular war damit dauerhaft sichtbarer als der
 * Inhalt, um den es geht.
 *
 * Jetzt ein Plus in der Kopfzeile der Liste. Der Dialog kommt, wenn man ihn
 * ruft, und ist danach wieder weg.
 */

/** Das Plus in der Kopfzeile — überall gleich. */
function PlusKnopf({
  onClick, titel,
}: { onClick: () => void; titel: string }) {
  return (
    <button type="button" onClick={onClick} title={titel} aria-label={titel}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border
                 border-line bg-sand text-sm leading-none text-ink-muted
                 transition duration-150 ease-tactile hover:border-line-strong
                 hover:text-ink active:scale-90">
      +
    </button>
  );
}

/**
 * Neue Aufgabe oder neues Habit.
 *
 * Der Zähler `runde` setzt das Formular nach dem Anlegen zurück: React hält
 * die Felder sonst mit dem zuletzt Getippten fest, weil die Komponente
 * eingehängt bleibt. Ein neuer `key` baut sie frisch auf — billiger und
 * verlässlicher, als jedes Feld einzeln zu leeren.
 */
export function NeueAufgabe({
  projekte, datum,
}: {
  projekte: Projekt[];
  /** Vorbelegtes Datum, z. B. wenn der Dialog aus einem Kalendertag kommt. */
  datum?: string;
}) {
  const [offen, setOffen] = useState(false);
  const [runde, setRunde] = useState(0);
  const [pending, start] = useTransition();

  function absenden(fd: FormData) {
    start(async () => {
      await aufgabeAnlegen(fd);
      setRunde((r) => r + 1);
      setOffen(false);
    });
  }

  return (
    <>
      <PlusKnopf onClick={() => setOffen(true)} titel="Neue Aufgabe" />

      <Modal offen={offen} schliessen={() => setOffen(false)} breite="max-w-md">
        <ModalKopf schliessen={() => setOffen(false)}>
          <span className="font-display text-base font-bold text-ink">
            Neue Aufgabe
          </span>
        </ModalKopf>

        <form key={runde} action={absenden} className="space-y-4 px-5 py-5">
          <div>
            <Label htmlFor="neu-task-name">Was</Label>
            <Input id="neu-task-name" name="name" required autoFocus
              placeholder="Steuererklärung anfangen" className="w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="neu-task-art">Art</Label>
              <Select id="neu-task-art" name="category" defaultValue="Aufgabe"
                className="w-full">
                {KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="neu-task-datum">Wann</Label>
              <Input id="neu-task-datum" name="due_date" type="date"
                defaultValue={datum} className="w-full" />
            </div>
          </div>

          <div>
            <Label htmlFor="neu-task-projekt">Projekt</Label>
            <Select id="neu-task-projekt" name="project_id" defaultValue=""
              className="w-full">
              <option value="">ohne Projekt</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-faint">
            Datum und Projekt sind beide freiwillig. Ohne Datum steht der
            Eintrag in der Ablage unter dem Kalender und lässt sich von dort
            auf einen Tag ziehen. Ein <strong className="text-ink-muted">Habit
            </strong> ist strukturell dasselbe wie eine Aufgabe — derselbe
            Kalender, derselbe Haken, nur mit ↻ markiert. Gewohnheiten mit
            Serie und Varianten legst du dagegen in den Einstellungen an.
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "…" : "Anlegen"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Neues Projekt — Name und Farbe, mehr hat ein Projekt nicht. */
export function NeuesProjekt({ knopf = "plus" }: { knopf?: "plus" | "kachel" }) {
  const [offen, setOffen] = useState(false);
  const [runde, setRunde] = useState(0);
  const [pending, start] = useTransition();

  function absenden(fd: FormData) {
    start(async () => {
      await projektAnlegen(fd);
      setRunde((r) => r + 1);
      setOffen(false);
    });
  }

  return (
    <>
      {knopf === "plus" ? (
        <PlusKnopf onClick={() => setOffen(true)} titel="Neues Projekt" />
      ) : (
        // Als leere Kachel im Raster: so sieht man auch ohne ein einziges
        // Projekt, wo eins entsteht — statt einer Leermeldung, die nichts tut.
        <button type="button" onClick={() => setOffen(true)}
          className={cx(
            "flex min-h-[86px] items-center justify-center gap-2 rounded-2xl",
            "border border-dashed border-line/70 px-4 py-3 text-sm text-ink-muted",
            "transition duration-150 ease-tactile hover:border-line-strong",
            "hover:text-ink-soft active:scale-[0.98]")}>
          <span aria-hidden className="text-base leading-none">+</span>
          Neues Projekt
        </button>
      )}

      <Modal offen={offen} schliessen={() => setOffen(false)} breite="max-w-sm">
        <ModalKopf schliessen={() => setOffen(false)}>
          <span className="font-display text-base font-bold text-ink">
            Neues Projekt
          </span>
        </ModalKopf>

        <form key={runde} action={absenden} className="space-y-4 px-5 py-5">
          <div>
            <Label htmlFor="neu-projekt-name">Name</Label>
            <Input id="neu-projekt-name" name="name" required autoFocus
              placeholder="Wohnungssuche" className="w-full" />
          </div>

          <div>
            <Label htmlFor="neu-projekt-farbe">Farbe</Label>
            <Input id="neu-projekt-farbe" name="color" type="color"
              defaultValue="#9A8C74" className="h-9 w-16 p-1" />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Färbt die Einträge dieses Projekts im Kalender — damit man auf
              einen Blick sieht, woran ein Tag hängt.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "…" : "Anlegen"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
