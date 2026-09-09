"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { aufgabeVerschieben, aufgabeAbhaken } from "@/lib/planung-actions";
import { gewohnheitAbhaken } from "@/lib/gewohnheiten-actions";
import { monatPlus, monatsLabel, tagPlus } from "@/lib/planung-kalender";
import type { Aufgabe } from "@/lib/planung-typen";
import type { GewohnheitsMarke } from "@/lib/gewohnheiten";
import type { KalenderTag } from "@/lib/planung-kalender";
import type { KalenderAnsicht } from "@/lib/planung-typen";
import { Card, cx } from "@/components/ui";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Der Kalender — Aufgaben an ihren Tagen, verschiebbar per Ziehen.
 *
 * **Woche oder Monat.** Die Woche ist die Vorgabe: sieben breite Spalten, in
 * denen ein Eintrag lesbar dasteht statt als Farbstreifen. Sie beantwortet
 * „was ist jetzt dran", und das ist die Frage, mit der man morgens auf die
 * Seite schaut. Der Monat beantwortet „wann habe ich Zeit" — seltener
 * gebraucht, deshalb hinter dem Umschalter. Beides läuft über die Adresse
 * (`?ansicht=`, `?von=`), damit ein Zeitraum verlinkbar bleibt, der
 * Zurück-Knopf tut was er soll und die Seite eine Server-Komponente bleibt.
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
 *
 * **Die Checkbox in der Kachel** ruft dieselbe Aktion wie die Liste darunter
 * (`aufgabeAbhaken`) — es gibt einen Eintrag und einen Haken, nicht zwei.
 * Habits sehen dabei aus wie alles andere: sie sind Aufgaben mit einem
 * Etikett, kein zweites Modell.
 *
 * **Die Gewohnheiten aus dem Tracker stehen ebenfalls hier**, unten in der
 * Zelle und optisch abgesetzt. Sie sind ETWAS ANDERES als die Aufgaben
 * darüber: eine Aufgabe ist etwas, das getan werden soll, eine
 * Gewohnheits-Marke etwas, das getan WURDE. Deshalb kein leeres Kästchen und
 * kein Ziehen — nur der erledigte Tag, den man mit einem Druck wieder
 * wegnimmt, falls er versehentlich dasteht. Eingetragen wird oben in der
 * Gewohnheiten-Karte, wo auch Variante und Nachtrag hingehören.
 *
 * Zwei Monatsansichten nebeneinander, die beide behaupten den Tag zu zeigen,
 * wären der Fehler gewesen — deshalb ein Kalender für beides.
 */
export function PlanungKalender({
  ansicht, anker, tage, aufgaben, marken = [], basis = "/planung",
}: {
  ansicht: KalenderAnsicht;
  /** Erster Tag des Zeitraums — Montag bzw. Monatserster. */
  anker: string;
  tage: KalenderTag[];
  /** Alle Aufgaben MIT Datum. Die ohne stehen in der Ablage daneben. */
  aufgaben: Aufgabe[];
  /** Was der Gewohnheiten-Tracker an diesen Tagen verzeichnet hat. */
  marken?: GewohnheitsMarke[];
  /**
   * Wohin das Blaettern zeigt. Der Kalender steht auf der Startseite UND
   * unter /planung; ein fest verdrahteter Pfad wuerde einen von beiden beim
   * Monatswechsel auf die andere Seite werfen.
   */
  basis?: string;
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

  const markenProTag = new Map<string, GewohnheitsMarke[]>();
  for (const m of marken) {
    const liste = markenProTag.get(m.datum) ?? [];
    liste.push(m);
    markenProTag.set(m.datum, liste);
  }

  /**
   * Beschriftung und Sprungziele hängen an der Ansicht.
   *
   * „8.–14. September" statt „September 2026", wenn eine Woche dasteht: der
   * Monatsname allein liesse offen, welche der vier Wochen man sieht.
   */
  const zurueck = ansicht === "woche"
    ? tagPlus(anker, -7) : monatPlus(anker, -1).slice(0, 7);
  const vor = ansicht === "woche"
    ? tagPlus(anker, 7) : monatPlus(anker, 1).slice(0, 7);

  const titel = ansicht === "monat" ? monatsLabel(anker) : (() => {
    const ende = tagPlus(anker, 6);
    const tagNr = (d: string) => Number(d.slice(8, 10));
    // Läuft die Woche über den Monatswechsel, muss der erste Monat mit dran
    // — „30.–6. Oktober" wäre sonst schlicht falsch.
    return anker.slice(0, 7) === ende.slice(0, 7)
      ? `${tagNr(anker)}.–${tagNr(ende)}. ${monatsLabel(anker)}`
      : `${tagNr(anker)}. ${monatsLabel(anker).split(" ")[0]} – `
        + `${tagNr(ende)}. ${monatsLabel(ende)}`;
  })();

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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`${basis}?ansicht=${ansicht}&von=${zurueck}`} scroll={false}
          aria-label={ansicht === "woche" ? "Woche zurück" : "Monat zurück"}
          className="rounded-lg px-2 py-0.5 text-ink-muted transition
                     hover:bg-sand hover:text-ink-soft">
          ‹
        </Link>
        <span className="font-display text-sm font-bold text-ink">{titel}</span>
        <Link href={`${basis}?ansicht=${ansicht}&von=${vor}`} scroll={false}
          aria-label={ansicht === "woche" ? "Woche vor" : "Monat vor"}
          className="rounded-lg px-2 py-0.5 text-ink-muted transition
                     hover:bg-sand hover:text-ink-soft">
          ›
        </Link>

        {/* Der Umschalter ganz rechts: er gehört zur Kopfzeile des Kalenders,
            nicht in die Einstellungen — man wechselt ihn im Lauf eines Tages,
            nicht einmal im Jahr. */}
        <span className="ml-auto flex items-center gap-1 rounded-xl bg-sand p-0.5">
          {(["woche", "monat"] as const).map((a) => (
            <Link key={a} href={`${basis}?ansicht=${a}`} scroll={false}
              className={cx("rounded-lg px-2.5 py-1 text-xs transition",
                a === ansicht
                  ? "bg-card font-medium text-ink"
                  : "text-ink-muted hover:text-ink-soft")}>
              {a === "woche" ? "Woche" : "Monat"}
            </Link>
          ))}
        </span>
      </div>

      {ansicht === "monat" && (
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WOCHENTAGE.map((t) => (
            <div key={t} className="text-center text-[10px] text-ink-faint">{t}</div>
          ))}
        </div>
      )}

      <div className={cx("grid gap-1",
        ansicht === "woche" ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-7")}>
        {tage.map((tag) => {
          const drin = proTag.get(tag.datum) ?? [];
          const getan = markenProTag.get(tag.datum) ?? [];
          return (
            <div key={tag.datum}
              onDragOver={(e) => { e.preventDefault(); setUeber(tag.datum); }}
              onDragLeave={() => setUeber((u) => (u === tag.datum ? null : u))}
              onDrop={(e) => { e.preventDefault(); ablegen(tag.datum); }}
              className={cx(
                "rounded-lg border p-1 transition",
                ansicht === "woche" ? "min-h-[150px]" : "min-h-[76px]",
                tag.ausserhalb ? "border-line/30 bg-transparent" : "border-line/60 bg-sand/30",
                ueber === tag.datum && "border-accent bg-accent-tint",
                tag.heute && "ring-1 ring-accent")}>
              <div className={cx("mb-1 flex items-baseline gap-1 px-0.5 text-[10px]",
                tag.heute ? "font-medium text-accent-soft"
                  : tag.ausserhalb ? "text-ink-faint/40" : "text-ink-faint")}>
                {/* In der Woche steht der Wochentag dabei — ohne Kopfzeile
                    darüber wäre sonst nicht klar, welcher Tag das ist. */}
                {ansicht === "woche" && (
                  <span>{WOCHENTAGE[(tage.indexOf(tag) + 7) % 7]}</span>
                )}
                <span>{Number(tag.datum.slice(8, 10))}.</span>
              </div>

              <div className="space-y-1">
                {drin.map((a) => (
                  <div key={a.id} draggable
                    onDragStart={() => setGezogen(a.id)}
                    onDragEnd={() => { setGezogen(null); setUeber(null); }}
                    title={[
                      a.name,
                      a.kategorie === "Habit" ? "Habit" : null,
                      a.projektName,
                    ].filter(Boolean).join(" · ")}
                    className={cx(
                      "flex cursor-grab items-center gap-1 rounded px-1 py-0.5",
                      "text-[10px] leading-tight active:cursor-grabbing",
                      a.erledigt ? "bg-sand text-ink-faint" : "text-ink-on",
                      gezogen === a.id && "opacity-40")}
                    style={a.erledigt ? undefined : {
                      background: a.projektFarbe ?? "#9A8C74",
                    }}>
                    {/* Abhaken direkt in der Kachel. Eigenes Formular, damit
                        der Klick genau diesen Eintrag schickt — und nicht
                        das Ziehen ausloest: ein Knopf faengt den Zeiger ab. */}
                    <form action={aufgabeAbhaken} className="shrink-0 leading-none">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="done" value={a.erledigt ? "0" : "1"} />
                      <button type="submit" draggable={false}
                        aria-label={a.erledigt ? "wieder öffnen" : "erledigt"}
                        className={cx(
                          "grid h-[13px] w-[13px] place-items-center rounded-[3px]",
                          "border text-[9px] transition active:scale-90",
                          a.erledigt
                            ? "border-ink-faint/50 text-ink-faint"
                            : "border-ink-on/50 text-transparent hover:bg-ink-on/20")}>
                        ✓
                      </button>
                    </form>
                    {/* Ein Habit ist optisch dasselbe wie eine Aufgabe, nur
                        mit Etikett — genau das ist der Punkt am Modell. */}
                    {a.kategorie === "Habit" && (
                      <span aria-hidden className="shrink-0 opacity-70">↻</span>
                    )}
                    <span className={cx("truncate", a.erledigt && "line-through")}>
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Was der Tracker verzeichnet hat. Abgesetzt durch eine feine
                  Linie: darüber steht, was zu tun ist, darunter, was war. */}
              {getan.length > 0 && (
                <div className={cx("space-y-0.5",
                  drin.length > 0 && "mt-1 border-t border-line/40 pt-1")}>
                  {getan.map((m) => (
                    <form key={`${m.habitId}-${m.variante ?? ""}`}
                      action={gewohnheitAbhaken}>
                      <input type="hidden" name="id" value={m.habitId} />
                      <input type="hidden" name="datum" value={m.datum} />
                      {/* Leerer Wert heisst „wieder wegnehmen". */}
                      <input type="hidden" name="getan" value="" />
                      {m.variante && (
                        <input type="hidden" name="variante" value={m.variante} />
                      )}
                      <button type="submit" draggable={false}
                        title={`${m.name}${m.variante ? ` — ${m.variante}` : ""} `
                          + "· erledigt, nochmal drücken nimmt weg"}
                        className="flex w-full items-center gap-1 truncate rounded
                                   px-1 py-0.5 text-left text-[10px] leading-tight
                                   text-ink-soft transition hover:bg-sand/60">
                        <span aria-hidden className="shrink-0"
                          style={{ color: m.farbe }}>✓</span>
                        <span className="truncate">
                          {m.icon && <span className="mr-0.5">{m.icon}</span>}
                          {m.variante ?? m.name}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              )}
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
            title={[a.name, a.kategorie === "Habit" ? "Habit" : null, a.projektName]
              .filter(Boolean).join(" · ")}
            className={cx(
              "flex cursor-grab items-center gap-1 truncate rounded-lg px-2 py-1",
              "text-[11px] text-ink-on active:cursor-grabbing",
              gezogen === a.id && "opacity-40")}
            style={{ background: a.projektFarbe ?? "#9A8C74" }}>
            {a.kategorie === "Habit" && (
              <span aria-hidden className="shrink-0 opacity-70">↻</span>
            )}
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
