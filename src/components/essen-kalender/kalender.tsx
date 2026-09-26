"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { essenNotizSpeichern } from "@/lib/essen-notizen/actions";

/**
 * Monatskalender mit einem Notizfeld pro Tag.
 *
 * Klick auf einen Tag öffnet sein Notizfeld — leer, ausser es steht schon
 * etwas drin. Gespeichert wird von selbst: kurz nach dem letzten Tippen und
 * beim Verlassen des Feldes. Tage mit Notiz tragen im Kalender die ersten
 * Worte, damit man den Monat überfliegen kann.
 */

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const pad = (n: number) => String(n).padStart(2, "0");

function monatPlus(monat: string, n: number): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

type Speicherstand = "gespeichert" | "tippt" | "speichert" | "fehler";

export function EssenKalender({ monat, heute, notizen }: {
  monat: string; heute: string; notizen: Record<string, string>;
}) {
  const [texte, setTexte] = useState<Record<string, string>>(notizen);
  const [gewaehlt, setGewaehlt] = useState<string>(
    heute.startsWith(monat) ? heute : `${monat}-01`);
  const [stand, setStand] = useState<Speicherstand>("gespeichert");
  const [fehler, setFehler] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const offen = useRef<{ datum: string; text: string } | null>(null);
  const feld = useRef<HTMLTextAreaElement>(null);

  const [j, m] = monat.split("-").map(Number);
  const tageImMonat = new Date(Date.UTC(j, m, 0)).getUTCDate();
  const versatz = (new Date(Date.UTC(j, m - 1, 1)).getUTCDay() + 6) % 7; // Montag = 0
  const titel = new Date(Date.UTC(j, m - 1, 15)).toLocaleDateString("de-CH", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  async function jetztSpeichern() {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const p = offen.current;
    if (!p) return;
    offen.current = null;
    setStand("speichert");
    const f = await essenNotizSpeichern(p.datum, p.text);
    setFehler(f);
    setStand(f ? "fehler" : offen.current ? "tippt" : "gespeichert");
  }

  // Beim Verlassen der Seite nichts verlieren.
  useEffect(() => () => { void jetztSpeichern(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function tippen(text: string) {
    setTexte((t) => ({ ...t, [gewaehlt]: text }));
    offen.current = { datum: gewaehlt, text };
    setStand("tippt");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void jetztSpeichern(); }, 800);
  }

  function waehlen(datum: string) {
    void jetztSpeichern();
    setGewaehlt(datum);
    window.setTimeout(() => feld.current?.focus(), 0);
  }

  const zellen: (string | null)[] = [
    ...Array.from({ length: versatz }, () => null),
    ...Array.from({ length: tageImMonat }, (_, i) => `${monat}-${pad(i + 1)}`),
  ];
  while (zellen.length % 7 !== 0) zellen.push(null);

  const gewaehltLabel = new Date(`${gewaehlt}T12:00:00Z`).toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-2xl border border-line/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/m/Essen?m=${monatPlus(monat, -1)}`}
            className="rounded-lg bg-sand px-3 py-1.5 text-sm text-ink-soft hover:text-ink">←</Link>
          <div className="text-center">
            <h2 className="font-display text-lg font-bold capitalize text-ink">{titel}</h2>
            {!heute.startsWith(monat) && (
              <Link href="/m/Essen" className="text-xs text-accent-soft hover:underline">Heute</Link>
            )}
          </div>
          <Link href={`/m/Essen?m=${monatPlus(monat, 1)}`}
            className="rounded-lg bg-sand px-3 py-1.5 text-sm text-ink-soft hover:text-ink">→</Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase
                        tracking-wide text-ink-faint">
          {WOCHENTAGE.map((w) => <div key={w} className="pb-1">{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {zellen.map((d, i) => {
            if (!d) return <div key={`leer-${i}`} />;
            const text = texte[d]?.trim() ?? "";
            const istHeute = d === heute;
            const aktiv = d === gewaehlt;
            return (
              <button key={d} type="button" onClick={() => waehlen(d)}
                className={cx(
                  "flex min-h-[64px] flex-col rounded-xl border p-1.5 text-left transition sm:min-h-[84px]",
                  aktiv ? "border-accent bg-accent-tint"
                    : text ? "border-line bg-sand hover:border-line-strong"
                      : "border-line/50 hover:border-line-strong hover:bg-sand/60",
                  d > heute && !text && "opacity-50")}>
                <span className={cx("tabular text-xs font-semibold",
                  istHeute ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-ink-on"
                    : aktiv ? "text-accent-soft" : "text-ink-soft")}>
                  {Number(d.slice(8))}
                </span>
                {text && (
                  <span className="mt-1 line-clamp-3 hidden text-[10px] leading-tight text-ink-muted sm:block">
                    {text}
                  </span>
                )}
                {text && <span className="mt-auto h-1.5 w-1.5 rounded-full bg-essen sm:hidden" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-line/70 bg-card p-4 shadow-card sm:p-5 lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-bold capitalize text-ink">{gewaehltLabel}</h2>
          <span className={cx("text-[11px]",
            stand === "fehler" ? "text-bad-bright" : "text-ink-faint")}>
            {stand === "gespeichert" ? "gespeichert"
              : stand === "speichert" ? "speichert …"
                : stand === "tippt" ? "…" : "nicht gespeichert"}
          </span>
        </div>
        <textarea ref={feld} value={texte[gewaehlt] ?? ""}
          onChange={(e) => tippen(e.target.value)}
          onBlur={() => { void jetztSpeichern(); }}
          rows={12}
          placeholder={"Was hast du gegessen?\n\nz.B.\nMorgen: Porridge\nMittag: Meal Prep Poulet/Reis\nAbend: Quark mit Beeren"}
          className="w-full resize-y rounded-xl border border-line bg-field px-3 py-2.5 text-sm
                     leading-relaxed text-ink outline-none placeholder:text-ink-faint
                     focus:border-accent focus:ring-2 focus:ring-accent/20" />
        {fehler && <p className="mt-2 text-xs text-bad-bright">{fehler}</p>}
      </section>
    </div>
  );
}
