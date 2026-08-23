"use client";

import { useState } from "react";
import { createAppointment, createTask } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";
import { cx } from "@/components/ui";

/**
 * Ein Formular, zwei Arten: Termin oder Aufgabe.
 *
 * Der Unterschied ist nicht kosmetisch, deshalb sind es zwei getrennte
 * Formulare hinter einem Umschalter statt eines Formulars mit ausgegrauten
 * Feldern: Ein Termin hat eine Uhrzeit und passiert, ob man will oder nicht.
 * Eine Aufgabe hat eine Frist und wird abgehakt. Ein gemeinsames Formular
 * müsste die Hälfte der Felder je nach Auswahl ignorieren — und genau daraus
 * entstehen Zeilen, in denen Werte stehen, die niemand gemeint hat.
 *
 * Gespeichert wird in die zwei Tabellen, die es ohnehin schon gibt
 * (`appointments`, `tasks`). Eine gemeinsame Tabelle mit Art-Spalte wäre eine
 * Migration für einen Unterschied, der ohnehin bleibt.
 */
export function TerminAufgabeForm({ heute }: { heute: string }) {
  const [art, setArt] = useState<"termin" | "aufgabe">("termin");

  return (
    <>
      <div className="mb-4 flex gap-1.5">
        {([["termin", "Termin"], ["aufgabe", "Aufgabe"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setArt(k)}
            className={cx(
              "rounded-xl px-3.5 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
              art === k
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      {art === "termin" ? (
        <form action={createAppointment} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">Was</Label>
              <Input id="title" name="title" required placeholder="z.B. Zahnarzt" />
            </div>
            <div>
              <Label htmlFor="starts_on">Wann</Label>
              <Input id="starts_on" name="starts_on" type="date"
                defaultValue={heute} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="start">Von — leer heisst ganztägig</Label>
              <Input id="start" name="start" type="time" />
            </div>
            <div>
              <Label htmlFor="end">Bis</Label>
              <Input id="end" name="end" type="time" />
            </div>
            <div>
              <Label htmlFor="location">Ort</Label>
              <Input id="location" name="location" placeholder="optional" />
            </div>
          </div>
          <div>
            <Label htmlFor="note">Notiz</Label>
            <Input id="note" name="note" placeholder="optional" />
          </div>

          {/* Steuert, ab wann der Termin auf der Startseite auftaucht.
              Leer = zwei Tage vorher. Wer etwas vorbereiten muss, setzt
              hier den Tag, an dem die Vorbereitung beginnt. */}
          <div className="rounded-xl bg-sand/60 p-3">
            <Label htmlFor="show_from">
              Muss ich etwas vorbereiten? Dann ab wann erinnern
            </Label>
            <Input id="show_from" name="show_from" type="date" />
            <p className="mt-1 text-xs text-ink-muted">
              Leer lassen, wenn nichts vorzubereiten ist — dann erscheint der
              Termin zwei Tage vorher auf der Startseite.
            </p>
          </div>

          <Button type="submit">Termin anlegen</Button>
        </form>
      ) : (
        <form action={createTask} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="t-title">Was</Label>
              <Input id="t-title" name="title" required placeholder="z.B. Steuererklärung" />
            </div>
            <div>
              <Label htmlFor="due_on">Bis wann — darf leer bleiben</Label>
              <Input id="due_on" name="due_on" type="date" />
            </div>
          </div>
          <div>
            <Label htmlFor="details">Notiz</Label>
            <Input id="details" name="details" placeholder="optional" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="priority" className="accent-accent" />
            wichtig
          </label>
          <Button type="submit">Aufgabe anlegen</Button>
        </form>
      )}
    </>
  );
}
