import Link from "next/link";
import { Card } from "@/components/ui";

export interface AchsenBlock {
  id: string;
  /** Minuten seit Mitternacht. */
  von: number;
  bis: number;
  titel: string;
  farbe: string;
  schlaf: boolean;
}

export interface AchsenMarke {
  id: string;
  minute: number;
  titel: string;
  zusatz: string | null;
}

/** Der sichtbare Ausschnitt. Vor 5 und nach 24 Uhr passiert nichts Erfasstes. */
const START = 5 * 60;
const ENDE = 24 * 60;
const SPANNE = ENDE - START;

/** Höhe der Achse in Pixel - eine Stunde bekommt gut 34 px. */
const HOEHE = 640;

const zuY = (minute: number) =>
  ((Math.min(ENDE, Math.max(START, minute)) - START) / SPANNE) * HOEHE;

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const dauerText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

/**
 * Der Tag als senkrechte Achse.
 *
 * Belegte Zeit steht als farbiger Block links an der Linie, offene Zeit
 * bleibt sichtbar leer und ist antippbar. Genau diese Lücken sind das, was
 * in der Wochenauswertung als "unerfasst" zusammengezählt wird - hier sieht
 * man, wo sie liegen, statt nur wie viele es sind.
 */
export function Tagesachse({
  bloecke, marken, ohneZeit,
}: {
  bloecke: AchsenBlock[];
  marken: AchsenMarke[];
  ohneZeit: number;
}) {
  const sortiert = [...bloecke].sort((a, b) => a.von - b.von);

  // Lücken zwischen den Blöcken. Unter 20 Minuten ignorieren - das sind
  // Rundungsreste zwischen zwei Einträgen, keine verlorene Zeit.
  const luecken: { von: number; bis: number }[] = [];
  let cursor = START;
  for (const b of sortiert) {
    if (b.von - cursor >= 20) luecken.push({ von: cursor, bis: b.von });
    cursor = Math.max(cursor, b.bis);
  }
  if (ENDE - cursor >= 20) luecken.push({ von: cursor, bis: ENDE });

  const offenGesamt = luecken.reduce((s, l) => s + (l.bis - l.von), 0);
  const erfasst = sortiert.reduce((s, b) => s + (b.bis - b.von), 0);

  const stunden = Array.from(
    { length: Math.floor(SPANNE / 60) + 1 },
    (_, i) => START + i * 60,
  );

  return (
    <>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <span className="text-ink-muted">
            Erfasst <span className="tabular font-medium text-ink">{dauerText(erfasst)}</span>
          </span>
          <span className="text-ink-muted">
            Offen <span className="tabular font-medium text-accent">{dauerText(offenGesamt)}</span>
          </span>
          {ohneZeit > 0 && (
            <span className="text-ink-faint">
              {dauerText(ohneZeit)} ohne Startzeit
            </span>
          )}
        </div>

        <div className="relative" style={{ height: HOEHE }}>
          {/* Stundenraster */}
          {stunden.map((m) => (
            <div key={m} className="absolute inset-x-0 flex items-center gap-2"
              style={{ top: zuY(m) }}>
              <span className="tabular w-9 shrink-0 text-right text-[10px] text-ink-faint">
                {hhmm(m)}
              </span>
              <span className="h-px flex-1 bg-line/50" />
            </div>
          ))}

          {/* Offene Zeit - bewusst sichtbar, nicht weggelassen */}
          {luecken.map((l, i) => (
            <Link key={i} href="/zeit"
              className="group absolute rounded-lg border border-dashed border-line
                         transition hover:border-accent/60 hover:bg-accent-tint/30"
              style={{
                top: zuY(l.von), height: Math.max(14, zuY(l.bis) - zuY(l.von)),
                left: "3rem", right: 0,
              }}>
              {zuY(l.bis) - zuY(l.von) > 26 && (
                <span className="absolute left-2 top-1 text-[10px] text-ink-faint
                                 transition group-hover:text-accent-soft">
                  {dauerText(l.bis - l.von)} offen — eintragen
                </span>
              )}
            </Link>
          ))}

          {/* Erfasste Blöcke */}
          {sortiert.map((b) => {
            const hoehe = Math.max(16, zuY(b.bis) - zuY(b.von));
            return (
              <div key={b.id}
                className="absolute overflow-hidden rounded-lg px-2 py-1"
                style={{
                  top: zuY(b.von), height: hoehe, left: "3rem", right: 0,
                  background: b.schlaf ? "#2A2118" : b.farbe + "2E",
                  borderLeft: `3px solid ${b.farbe}`,
                }}>
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-medium text-ink">{b.titel}</span>
                  {hoehe > 30 && (
                    <span className="tabular shrink-0 text-[10px] text-ink-muted">
                      {hhmm(b.von)}–{hhmm(b.bis)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Termine als Marker über allem */}
          {marken.map((t) => (
            <div key={t.id} className="absolute inset-x-0 flex items-center gap-1.5"
              style={{ top: zuY(t.minute) - 7, left: "3rem" }}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent
                               ring-2 ring-paper" />
              <span className="truncate rounded bg-accent-tint px-1.5 py-0.5
                               text-[10px] font-medium text-accent-soft">
                {t.titel}{t.zusatz ? ` · ${t.zusatz}` : ""}
              </span>
            </div>
          ))}

          {/* Jetzt-Linie */}
          <JetztLinie />
        </div>
      </Card>

      <p className="px-1 text-xs text-ink-muted">
        Gestrichelte Flächen sind Zeit ohne Eintrag — antippen zum Nachtragen.
        Genau diese Stunden erscheinen in der Wochenauswertung als „unerfasst".
      </p>
    </>
  );
}

/** Wo steht der Tag gerade? Serverseitig gerendert, reicht bei force-dynamic. */
function JetztLinie() {
  const jetzt = new Date();
  const teile = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(jetzt);
  const h = Number(teile.find((t) => t.type === "hour")?.value ?? 0);
  const m = Number(teile.find((t) => t.type === "minute")?.value ?? 0);
  const minute = h * 60 + m;

  if (minute < START || minute > ENDE) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 flex items-center"
      style={{ top: zuY(minute) }}>
      <span className="tabular w-9 shrink-0 text-right text-[10px] font-medium text-bad-bright">
        {hhmm(minute)}
      </span>
      <span className="ml-2 h-px flex-1 bg-bad-bright/70" />
    </div>
  );
}
