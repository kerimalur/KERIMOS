"use client";
import { useMemo, useState } from "react";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";

interface MuscleLoad { id: string; name: string; sets: number; lastTrainedAt: string | null }

/**
 * Gegenspieler-Paare mit angestrebtem Verhältnis (Sätze A ÷ Sätze B).
 *
 * 0.8 bei Brust/Rücken heisst: der Rücken sollte etwa ein Viertel mehr
 * Volumen bekommen als die Brust. Wer nur drückt, zieht die Schultern nach
 * vorne — das ist der häufigste Fehler im Krafttraining.
 */
const PAARE: { a: string; b: string; label: string; soll: number; hinweis: string }[] = [
  {
    a: "Brust", b: "Rücken", label: "Brust / Rücken", soll: 0.8,
    hinweis: "Der Rücken sollte etwas mehr Volumen bekommen als die Brust — sonst zieht es die Schultern nach vorne.",
  },
  {
    a: "Quadrizeps", b: "Hamstrings", label: "Quadrizeps / Hamstrings", soll: 1.0,
    hinweis: "Vorder- und Rückseite im Gleichgewicht schützen das Knie.",
  },
  {
    a: "Bizeps", b: "Trizeps", label: "Bizeps / Trizeps", soll: 1.0,
    hinweis: "Ausgeglichene Arme halten den Ellbogen gesund.",
  },
  {
    a: "Schultern", b: "Rücken", label: "Schultern / Rücken", soll: 0.6,
    hinweis: "Viel Schulterarbeit ohne Rückenausgleich macht das Schultergelenk instabil.",
  },
];

type Stand = "ok" | "warn" | "bad";

function bewerte(ist: number, soll: number): Stand {
  const abweichung = Math.abs(ist - soll) / soll;
  if (abweichung < 0.2) return "ok";
  if (abweichung < 0.4) return "warn";
  return "bad";
}

function seitText(iso: string | null): string {
  if (!iso) return "nie trainiert";
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (tage === 0) return "heute";
  if (tage === 1) return "gestern";
  return `vor ${tage} Tagen`;
}

/**
 * Muskelbalance: nicht wie viel trainiert wurde, sondern wie gleichmässig.
 * Gezählt werden Sätze — nicht Gewicht, denn ein Satz Bizeps und ein Satz
 * Kniebeugen belasten unterschiedlich viel, kosten den Muskel aber je einen
 * Reiz.
 */
export function GymBalance({
  vier, acht, zwoelf,
}: { vier: MuscleLoad[]; acht: MuscleLoad[]; zwoelf: MuscleLoad[] }) {
  const [wochen, setWochen] = useState<4 | 8 | 12>(4);

  const daten = wochen === 4 ? vier : wochen === 8 ? acht : zwoelf;
  const gesamt = daten.reduce((s, m) => s + m.sets, 0);
  const max = Math.max(1, ...daten.map((m) => m.sets));

  const analyse = useMemo(() => PAARE.map((p) => {
    const finde = (name: string) =>
      daten.find((m) => m.name.toLowerCase().includes(name.toLowerCase()));
    const setsA = finde(p.a)?.sets ?? 0;
    const setsB = finde(p.b)?.sets ?? 0;
    const keineDaten = setsA === 0 && setsB === 0;
    // Ohne Gegenstück gibt es kein Verhältnis - dann ist es eindeutig schief
    const ist = setsB > 0 ? setsA / setsB : setsA > 0 ? 99 : 1;
    return {
      ...p, setsA, setsB, ist, keineDaten,
      stand: keineDaten ? ("ok" as Stand) : bewerte(ist, p.soll),
    };
  }), [daten]);

  const warnungen = analyse.filter((p) => p.stand !== "ok" && !p.keineDaten).length;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="mb-0">Zeitraum</CardTitle>
            <p className="mt-1 text-xs text-ink-muted">
              {gesamt} Sätze in {wochen} Wochen
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-sand p-1">
            {([4, 8, 12] as const).map((w) => (
              <button key={w} onClick={() => setWochen(w)}
                className={cx("rounded-md px-3 py-1 text-xs font-medium transition",
                  wochen === w ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
                {w} Wo.
              </button>
            ))}
          </div>
        </div>
      </Card>

      {gesamt === 0 ? (
        <Card>
          <CardTitle>Muskelbalance</CardTitle>
          <Empty>
            Keine Trainingsdaten im Zeitraum. Nach ein paar Einheiten wird
            sichtbar, was zu kurz kommt.
          </Empty>
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <CardTitle className="mb-0">Gegenspieler-Paare</CardTitle>
              {warnungen > 0 && (
                <Badge tone="warn">
                  {warnungen} {warnungen === 1 ? "Auffälligkeit" : "Auffälligkeiten"}
                </Badge>
              )}
            </div>

            <ul className="space-y-3">
              {analyse.map((p) => (
                <li key={p.label}
                  className={cx("rounded-xl border p-3",
                    p.keineDaten ? "border-line bg-sand/40"
                      : p.stand === "ok" ? "border-good/30 bg-good-tint/50"
                        : p.stand === "warn" ? "border-warn/30 bg-warn-tint/50"
                          : "border-bad/30 bg-bad-tint/50")}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{p.label}</span>
                    {p.keineDaten ? (
                      <span className="text-xs text-ink-muted">keine Daten</span>
                    ) : (
                      <span className={cx("text-xs font-medium",
                        p.stand === "ok" ? "text-good"
                          : p.stand === "warn" ? "text-warn" : "text-bad")}>
                        {p.stand === "ok" ? "ausgewogen" : "schief"}
                      </span>
                    )}
                  </div>

                  {!p.keineDaten && (
                    <>
                      <div className="space-y-1.5">
                        {[
                          { name: p.a, sets: p.setsA },
                          { name: p.b, sets: p.setsB },
                        ].map((seite) => {
                          const maxPaar = Math.max(1, p.setsA, p.setsB);
                          return (
                            <div key={seite.name} className="flex items-center gap-2">
                              <span className="w-28 shrink-0 truncate text-xs text-ink-soft">
                                {seite.name}
                              </span>
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-card">
                                <span className={cx("block h-full rounded-full",
                                  p.stand === "ok" ? "bg-good"
                                    : p.stand === "warn" ? "bg-warn" : "bg-bad")}
                                  style={{ width: `${(seite.sets / maxPaar) * 100}%` }} />
                              </span>
                              <span className="tabular w-16 shrink-0 text-right text-xs text-ink-muted">
                                {seite.sets} Sätze
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {p.stand !== "ok" && (
                        <p className="mt-2.5 rounded-lg bg-card/70 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                          {p.hinweis}
                        </p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Volumen nach Muskelgruppe</CardTitle>
            <ul className="space-y-2.5">
              {daten.map((m) => {
                const anteil = Math.round((m.sets / max) * 100);
                const lange = m.lastTrainedAt === null
                  || (Date.now() - new Date(m.lastTrainedAt).getTime()) / 86400000 >= 7;
                return (
                  <li key={m.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-ink-soft">{m.name}</span>
                      <span className="tabular shrink-0 text-xs text-ink-muted">
                        {m.sets} Sätze
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div className={cx("h-full rounded-full", lange ? "bg-warn" : "bg-accent")}
                        style={{ width: `${m.sets === 0 ? 3 : anteil}%` }} />
                    </div>
                    <span className={cx("mt-0.5 block text-[11px]",
                      lange ? "text-warn" : "text-ink-faint")}>
                      {seitText(m.lastTrainedAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
