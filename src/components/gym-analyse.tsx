"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle, cx } from "@/components/ui";
import { Koerper3D } from "@/components/gym/koerper-3d";
import { grenzeSetzen, grenzenZuruecksetzen } from "@/lib/muskel-grenzen-actions";
import { AM_KOERPER } from "@/lib/koerper-teile";
import {
  saetze, proWoche, urteil, grenzenFuer, rampe, alsHex,
  URTEIL_WORT, OHNE_KOERPER, STANDARD, type Grenzen, type Urteil,
} from "@/lib/muskel-analyse";

export interface AnalyseWert {
  id: string;
  name: string;
  direkt: number;
  indirekt: number;
  tage: number;
  /** Tage seit dem letzten Mal. Auf dem Server gerechnet — `Date.now()` im
   *  Browser ergäbe beim ersten Rendern eine andere Zahl als auf dem Server. */
  seitTagen: number | null;
  uebungen: { id: string; name: string; direkt: number; indirekt: number }[];
}

export interface Zeitraum {
  key: string;
  label: string;
  tage: number;
  werte: AnalyseWert[];
}

const TON: Record<Urteil, string> = {
  wenig: "bg-accent-tint text-accent-soft",
  knapp: "bg-accent-tint text-accent-soft",
  rahmen: "bg-good-tint text-good-bright",
  viel: "bg-bad-tint text-bad-bright",
};

const zahl = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");

function seitText(tage: number | null): string {
  if (tage === null) return "im Zeitraum nie";
  if (tage === 0) return "heute";
  if (tage === 1) return "gestern";
  return `vor ${tage} Tagen`;
}

export function GymAnalyse({ zeitraeume, grenzen }: {
  zeitraeume: Zeitraum[];
  grenzen: Record<string, Grenzen>;
}) {
  const [key, setKey] = useState(zeitraeume[0]?.key ?? "woche");
  const [mitIndirekt, setMitIndirekt] = useState(true);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  const zeitraum = zeitraeume.find((z) => z.key === key) ?? zeitraeume[0];

  const reihen = useMemo(() => {
    if (!zeitraum) return [];
    return zeitraum.werte.map((w) => {
      const gesamt = saetze(w, mitIndirekt);
      const pw = proWoche(gesamt, zeitraum.tage);
      const g = grenzenFuer(w.id, grenzen);
      return { w, gesamt, pw, grenzen: g, urteil: urteil(pw, g) };
    }).sort((a, b) => b.pw - a.pw);
  }, [zeitraum, mitIndirekt, grenzen]);

  // Der Körper bekommt nur das, was er zeichnet: Name → Sätze pro Woche.
  const fuerKoerper = useMemo(() => {
    const raus: Record<string, number> = {};
    for (const r of reihen) if (AM_KOERPER.includes(r.w.name)) raus[r.w.name] = r.pw;
    return raus;
  }, [reihen]);

  const aktiv = reihen.find((r) => r.w.name === gewaehlt) ?? reihen[0];
  const maxPw = Math.max(1, ...reihen.map((r) => r.pw));

  if (!zeitraum || reihen.length === 0) {
    return (
      <Card>
        <CardTitle>Analyse</CardTitle>
        <p className="text-sm text-ink-muted">
          Noch keine abgeschlossenen Trainings im Zeitraum. Sobald eine Einheit
          fertig ist, steht sie hier.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-sand p-1">
          {zeitraeume.map((z) => (
            <button key={z.key} onClick={() => setKey(z.key)}
              className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                z.key === key ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
              {z.label}
            </button>
          ))}
        </div>

        {/* Beide Sichten stimmen: „nur direkt" sagt, worauf du es angelegt
            hast, „mit indirekt" sagt, was der Muskel abbekommen hat. */}
        <button onClick={() => setMitIndirekt((v) => !v)}
          className={cx("rounded-xl border px-3 py-1.5 text-xs transition",
            mitIndirekt
              ? "border-accent-deep bg-accent-tint text-accent-soft"
              : "border-line text-ink-muted hover:border-line-strong")}>
          {mitIndirekt ? "mit Nebenmuskeln (halb)" : "nur Hauptmuskel"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <Koerper3D werte={fuerKoerper} gewaehlt={aktiv?.w.name ?? null}
            onWaehle={setGewaehlt} />
          <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] text-ink-muted">
            <span>Sätze pro Woche</span>
            <span className="flex h-2.5 w-44 overflow-hidden rounded-full">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} className="flex-1" style={{ background: alsHex(rampe(i)) }} />
              ))}
            </span>
            <span className="tabular">0 → 20+</span>
          </div>
        </div>

        {aktiv && (
          <Card area="gym">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="h-3 w-3 shrink-0 rounded"
                style={{ background: alsHex(rampe(aktiv.pw)) }} />
              <CardTitle className="mb-0">{aktiv.w.name}</CardTitle>
              <span className="ml-auto text-xs text-ink-muted">{zeitraum.label}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-display text-4xl font-bold"
                style={{ color: alsHex(rampe(aktiv.pw)) }}>
                {zahl(aktiv.gesamt)}
              </span>
              <span className="text-xs text-ink-muted">
                Sätze · {zahl(aktiv.pw)} pro Woche
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
              <span className={cx("rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                TON[aktiv.urteil])}>
                {URTEIL_WORT[aktiv.urteil]}
              </span>
              <span className="tabular text-[11px] text-ink-faint">
                dein Rahmen {aktiv.grenzen.min}–{aktiv.grenzen.max} Sätze je Woche
              </span>
            </div>

            <p className="mt-2.5 text-xs text-ink-muted">
              {aktiv.w.tage} {aktiv.w.tage === 1 ? "Trainingstag" : "Trainingstage"} ·
              zuletzt {seitText(aktiv.w.seitTagen)}
              {mitIndirekt && aktiv.w.indirekt > 0 && (
                <> · {aktiv.w.direkt} direkt, {aktiv.w.indirekt} als Nebenmuskel</>
              )}
            </p>

            {aktiv.w.uebungen.length === 0 ? (
              <p className="mt-3.5 text-sm text-ink-muted">
                Im Zeitraum keine einzige Übung für diese Gruppe. Das ist die
                Zahl, für die es diese Seite gibt.
              </p>
            ) : (
              <table className="mt-3.5 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.07em] text-ink-muted">
                    <th className="pb-2 font-medium">Übung</th>
                    <th className="pb-2 text-right font-medium">direkt</th>
                    {mitIndirekt && <th className="pb-2 text-right font-medium">mit</th>}
                  </tr>
                </thead>
                <tbody>
                  {aktiv.w.uebungen
                    .filter((u) => mitIndirekt || u.direkt > 0)
                    .map((u) => (
                      <tr key={u.id} className="border-t border-line">
                        <td className="py-2 text-ink-soft">{u.name}</td>
                        <td className="tabular py-2 text-right text-ink">
                          {u.direkt || "—"}
                        </td>
                        {mitIndirekt && (
                          <td className="tabular py-2 text-right text-ink-faint">
                            {u.indirekt || "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>

      {/* Dieselben Zahlen als Liste. Nicht als Zugabe: ohne WebGL bleibt nur
          sie, und sie trägt die Aussage allein. */}
      <Card flat>
        <CardTitle>Alle Muskelgruppen</CardTitle>
        <p className="mb-3 text-xs text-ink-muted">
          Der Körper ist die Übersicht, das hier die Kontrolle. Anklicken wählt
          die Gruppe auch am Modell aus.
        </p>
        <ul>
          {reihen.map((r) => {
            const ohne = OHNE_KOERPER.includes(r.w.name);
            const farbe = ohne ? "#3A322A" : alsHex(rampe(r.pw));
            return (
              <li key={r.w.id}>
                <button onClick={() => setGewaehlt(r.w.name)}
                  className={cx("flex w-full items-center gap-2.5 border-t border-line py-2 text-left text-sm transition",
                    r.w.name === aktiv?.w.name ? "text-accent-soft" : "hover:text-accent-soft")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: farbe }} />
                  <span className="w-24 shrink-0 truncate">{r.w.name}</span>
                  <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-sand">
                    <span className="block h-full rounded-full"
                      style={{ width: `${Math.round(r.pw / maxPw * 100)}%`, background: farbe }} />
                  </span>
                  <span className="tabular w-9 shrink-0 text-right">{zahl(r.gesamt)}</span>
                  <span className="tabular w-16 shrink-0 text-right text-xs text-ink-muted">
                    {zahl(r.pw)}/Wo
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs text-ink-muted sm:block">
                    {ohne ? "—" : URTEIL_WORT[r.urteil]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-faint">
          Cardio hat kein Körperteil und steht deshalb nur hier. Ein Urteil
          „zu wenig Cardio-Sätze" wäre Unsinn — dafür zählt die Zeit, nicht
          der Satz.
        </p>
      </Card>

      {/* Die Grenzen stehen dort, wo das Urteil steht. In den Einstellungen
          wären sie richtig einsortiert und würden nie gefunden — man will
          sie genau dann ändern, wenn eine Zeile falsch beurteilt aussieht. */}
      <Card flat>
        <details>
          <summary className="cursor-pointer list-none text-sm font-medium text-ink">
            Grenzen anpassen
            <span className="ml-2 text-xs font-normal text-ink-faint">
              Vorgabe {STANDARD.min}–{STANDARD.max} Sätze pro Woche
            </span>
          </summary>

          <p className="mt-2 text-xs text-ink-muted">
            Waden und Core vertragen andere Zahlen als der Rücken. Leer oder
            unsinnig eingetragen heisst: für diese Gruppe gilt wieder die
            Faustregel.
          </p>

          <ul className="mt-3">
            {reihen.filter((r) => !OHNE_KOERPER.includes(r.w.name)).map((r) => {
              const eigen = !!grenzen[r.w.id];
              return (
                <li key={r.w.id} className="border-t border-line py-2">
                  <form action={grenzeSetzen}
                    className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={r.w.id} />
                    <span className="w-24 shrink-0 truncate text-ink-soft">{r.w.name}</span>
                    <input name="min" inputMode="numeric" defaultValue={r.grenzen.min}
                      aria-label={`${r.w.name} Untergrenze`}
                      className="tabular w-14 rounded-lg border border-line bg-field px-2 py-1
                                 text-right text-ink outline-none focus:border-accent" />
                    <span className="text-ink-faint">bis</span>
                    <input name="max" inputMode="numeric" defaultValue={r.grenzen.max}
                      aria-label={`${r.w.name} Obergrenze`}
                      className="tabular w-14 rounded-lg border border-line bg-field px-2 py-1
                                 text-right text-ink outline-none focus:border-accent" />
                    <button className="rounded-lg border border-line px-2.5 py-1 text-xs
                                       text-ink-soft transition hover:border-line-strong">
                      übernehmen
                    </button>
                    {eigen && <span className="text-[11px] text-accent-soft">eigener Wert</span>}
                  </form>
                </li>
              );
            })}
          </ul>

          <form action={grenzenZuruecksetzen} className="mt-3">
            <button className="text-xs text-ink-faint transition hover:text-bad">
              Alle auf die Faustregel zurücksetzen
            </button>
          </form>
        </details>
      </Card>
    </div>
  );
}
