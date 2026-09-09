"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { aufgabeVerschieben } from "@/lib/planung-actions";
import { monatPlus, monatsLabel } from "@/lib/planung-kalender";
import type { Aufgabe } from "@/lib/planung";
import type { KalenderTag } from "@/lib/planung-kalender";
import { Card, cx } from "@/components/ui";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Der Monatskalender — Aufgaben an ihren Tagen, verschiebbar per Ziehen.
 *
 * **Warum keine Bibliothek.** Ziehen und Fallenlassen kann der Browser seit
 * jeher selbst (`draggable` plus die drag-Ereignisse). Ein Kalenderpaket
 * brächte eine eigene Datums- und Layoutwelt mit, die man dann pflegt, statt
 * fünfzehn Zeilen Ereignisbehandlung zu schreiben.
 *
 * **Warum der Zustand doppelt geführt wird.** Beim Fallenlassen wandert die
 * Aufgabe SOFORT sichtbar auf den neuen Tag (`verschoben`), während die
 * Server-Aktion noch läuft. Ohne das ruckelt jede Bewegung: man zieht, es
 * passiert nichts, und eine halbe Sekunde später springt die Karte. Sobald
 * der Server bestätigt hat, kommen die Daten frisch herein und die lokale
 * Notiz wird bedeutungslos — sie deckt nur die Lücke dazwischen.
 *
 * **Was gespeichert wird.** `aufgabeVerschieben` schreibt `due_date` in die
 * Datenbank. Das Ziehen ist also keine Ansichtssache: nach einem Neuladen
 * steht die Aufgabe dort, wo man sie hingelegt hat.
 */
export function PlanungKalender({
  monat, tage, aufgaben,
}: {
  monat: string;
  tage: KalenderTag[];
  /** Alle Aufgaben MIT Datum. Die ohne stehen in der Ablage daneben. */
  aufgaben: Aufgabe[];
}) {
  const [gezogen, setGezogen] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  /** Aufgabe → Datum, solange der Server noch nicht bestätigt hat. */
  const [verschoben, setVerschoben] = useState<Record<string, string | null>>({});
  const [, start] = useTransition();

  const datumVon = (a: Aufgabe) =>
    a.id in verschoben ? verschoben[a.id] : a.faellig;

  const proTag = new Map<string, Aufgabe[]>();
  for (const a of aufgaben) {
    const d = datumVon(a);
    if (!d) continue;
    const liste = proTag.get(d) ?? [];
    liste.push(a);
    proTag.set(d, liste);
  }

  function ablegen(datum: string | null) {
    const id = gezogen;
    setGezogen(null);
    setUeber(null);
    if (!id) return;

    setVerschoben((v) => ({ ...v, [id]: datum }));

    const fd = new FormData();
    fd.set("id", id);
    if (datum) fd.set("datum", datum);
    start(async () => { await aufgabeVerschieben(fd); });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`/planung?monat=${monatPlus(monat, -1).slice(0, 7)}`} scroll={false}
          aria-label="Monat zurück"
          className="rounded-lg px-2 py-0.5 text-ink-muted transition
                     hover:bg-sand hover:text-ink-soft">
          ‹
        </Link>
        <span className="font-display text-sm font-bold text-ink">
          {monatsLabel(monat)}
        </span>
        <Link href={`/planung?monat=${monatPlus(monat, 1).slice(0, 7)}`} scroll={false}
          aria-label="Monat vor"
          className="rounded-lg px-2 py-0.5 text-ink-muted transition
                     hover:bg-sand hover:text-ink-soft">
          ›
        </Link>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WOCHENTAGE.map((t) => (
          <div key={t} className="text-center text-[10px] text-ink-faint">{t}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {tage.map((tag) => {
          const drin = proTag.get(tag.datum) ?? [];
          return (
            <div key={tag.datum}
              onDragOver={(e) => { e.preventDefault(); setUeber(tag.datum); }}
              onDragLeave={() => setUeber((u) => (u === tag.datum ? null : u))}
              onDrop={(e) => { e.preventDefault(); ablegen(tag.datum); }}
              className={cx(
                "min-h-[76px] rounded-lg border p-1 transition",
                tag.ausserhalb ? "border-line/30 bg-transparent" : "border-line/60 bg-sand/30",
                ueber === tag.datum && "border-accent bg-accent-tint",
                tag.heute && "ring-1 ring-accent")}>
              <div className={cx("mb-1 px-0.5 text-[10px]",
                tag.heute ? "font-medium text-accent-soft"
                  : tag.ausserhalb ? "text-ink-faint/40" : "text-ink-faint")}>
                {Number(tag.datum.slice(8, 10))}
              </div>

              <div className="space-y-1">
                {drin.map((a) => (
                  <div key={a.id} draggable
                    onDragStart={() => setGezogen(a.id)}
                    onDragEnd={() => { setGezogen(null); setUeber(null); }}
                    title={`${a.name}${a.projektName ? ` · ${a.projektName}` : ""}`}
                    className={cx(
                      "cursor-grab truncate rounded px-1.5 py-0.5 text-[10px] leading-tight",
                      "active:cursor-grabbing",
                      a.erledigt
                        ? "bg-sand text-ink-faint line-through"
                        : "text-ink-on",
                      gezogen === a.id && "opacity-40")}
                    style={a.erledigt ? undefined : {
                      background: a.projektFarbe ?? "#9A8C74",
                    }}>
                    {a.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Die Ablage. Sie ist der Gegenweg zum Kalender: eine Aufgabe ohne
          Termin zieht man hinein, eine mit Termin wieder heraus. Ohne diese
          Fläche käme man aus dem Kalender nur über das Formular wieder
          raus — und ein Weg, der nur in eine Richtung geht, wird gemieden. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setUeber("ohne"); }}
        onDragLeave={() => setUeber((u) => (u === "ohne" ? null : u))}
        onDrop={(e) => { e.preventDefault(); ablegen(null); }}
        className={cx(
          "mt-3 flex min-h-[52px] flex-wrap items-center gap-1.5 rounded-xl border",
          "border-dashed p-2 transition",
          ueber === "ohne" ? "border-accent bg-accent-tint" : "border-line/60")}>
        <span className="px-1 text-[11px] text-ink-faint">
          ohne Termin
        </span>
        {aufgaben.filter((a) => datumVon(a) === null && !a.erledigt).map((a) => (
          <div key={a.id} draggable
            onDragStart={() => setGezogen(a.id)}
            onDragEnd={() => { setGezogen(null); setUeber(null); }}
            title={a.projektName ? `${a.name} · ${a.projektName}` : a.name}
            className={cx(
              "cursor-grab truncate rounded-lg px-2 py-1 text-[11px] text-ink-on",
              "active:cursor-grabbing",
              gezogen === a.id && "opacity-40")}
            style={{ background: a.projektFarbe ?? "#9A8C74" }}>
            {a.name}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        Ziehen legt eine Aufgabe auf einen anderen Tag — das Datum wird sofort
        gespeichert. In die gestrichelte Fläche gezogen verliert sie ihren
        Termin, ohne gelöscht zu werden.
      </p>
    </Card>
  );
}
