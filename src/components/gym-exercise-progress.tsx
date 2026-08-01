"use client";
import { useRouter } from "next/navigation";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardTitle, Empty, Select, Stat, cx } from "@/components/ui";

interface Punkt {
  day: string; maxWeight: number; oneRM: number;
  avgRIR: number | null; durationMin: number; distanceKm: number | null;
}
interface UebungOption {
  id: string; name: string; muscleName: string; isCardio: boolean;
}

const ZEITRAEUME = [
  { wert: 4, label: "4 Wo." },
  { wert: 12, label: "3 Mo." },
  { wert: 52, label: "1 Jahr" },
  { wert: 0, label: "Alles" },
];

const tagLabel = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("de-CH", {
    day: "2-digit", month: "short",
  });

/**
 * Fortschritt einer einzelnen Übung. Auswahl und Zeitraum stehen in der
 * Adresszeile - so lässt sich ein bestimmter Verlauf verlinken und der
 * Zurück-Knopf tut, was man erwartet.
 */
export function GymExerciseProgress({
  uebungen, gewaehlt, wochen, punkte, totals,
}: {
  uebungen: UebungOption[];
  gewaehlt: UebungOption | null;
  wochen: number;
  punkte: Punkt[];
  totals: { einheiten: number; saetze: number; volumen: number };
}) {
  const router = useRouter();

  function wechsle(exId: string, w: number) {
    router.push(`/gym/fortschritt?ex=${encodeURIComponent(exId)}&w=${w}`);
  }

  const letzter = punkte[punkte.length - 1];
  const erster = punkte[0];
  const veraenderung = erster && letzter && erster.maxWeight > 0
    ? Math.round(((letzter.maxWeight - erster.maxWeight) / erster.maxWeight) * 100)
    : null;

  const daten = punkte.map((p) => ({
    tag: tagLabel(p.day),
    wert: gewaehlt?.isCardio ? p.durationMin : p.maxWeight,
  }));

  return (
    <>
      <Card>
        <CardTitle>Gesamt</CardTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Einheiten" value={String(totals.einheiten)} />
          <Stat label="Sätze" value={String(totals.saetze)} />
          <Stat label="Volumen"
            value={`${totals.volumen.toLocaleString("de-CH")} kg`}
            sub="Gewicht × Wiederholungen" />
        </div>
      </Card>

      <Card>
        <CardTitle>Übung</CardTitle>
        {uebungen.length === 0 ? (
          <Empty>Noch keine Übung erfasst.</Empty>
        ) : (
          <>
            <Select value={gewaehlt?.id ?? ""}
              onChange={(e) => wechsle(e.target.value, wochen)}
              aria-label="Übung wählen" className="mb-3">
              {uebungen.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.isCardio ? "Cardio" : u.muscleName}
                </option>
              ))}
            </Select>

            <div className="flex gap-1 rounded-lg bg-sand p-1">
              {ZEITRAEUME.map((z) => (
                <button key={z.wert}
                  onClick={() => gewaehlt && wechsle(gewaehlt.id, z.wert)}
                  className={cx("flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                    wochen === z.wert ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
                  {z.label}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {gewaehlt && (
        <Card>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="mb-0">{gewaehlt.name}</CardTitle>
            {veraenderung !== null && (
              <span className={cx("text-xs font-medium",
                veraenderung > 0 ? "text-good" : veraenderung < 0 ? "text-bad" : "text-ink-muted")}>
                {veraenderung > 0 ? "+" : ""}{veraenderung} % im Zeitraum
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-ink-muted">
            {gewaehlt.isCardio
              ? "Dauer je Einheit in Minuten"
              : "Schwerster Satz je Einheit"}
          </p>

          {daten.length < 2 ? (
            <Empty>
              {daten.length === 0
                ? "Keine Daten im Zeitraum."
                : "Erst ab der zweiten Einheit entsteht eine Kurve."}
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#2E2519" vertical={false} />
                <XAxis dataKey="tag" stroke="#9A8C74" fontSize={11}
                  tickLine={false} axisLine={false} />
                <YAxis stroke="#9A8C74" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) =>
                    gewaehlt.isCardio ? `${v} min` : `${v} kg`}
                  contentStyle={{
                    background: "#1E1811", border: "1px solid #2E2519",
                    borderRadius: 8, fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="wert" stroke="#5FC2A6" strokeWidth={2}
                  dot={{ r: 3, fill: "#5FC2A6" }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {letzter && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {gewaehlt.isCardio ? (
                <>
                  <Kennzahl label="Letzte Dauer" wert={`${letzter.durationMin} min`} />
                  <Kennzahl label="Letzte Distanz"
                    wert={letzter.distanceKm !== null ? `${letzter.distanceKm} km` : "—"} />
                </>
              ) : (
                <>
                  <Kennzahl label="Geschätztes 1RM" wert={`${letzter.oneRM} kg`}
                    hinweis="Gewicht, das rechnerisch einmal ginge" />
                  <Kennzahl label="RIR zuletzt"
                    wert={letzter.avgRIR !== null ? String(letzter.avgRIR) : "—"}
                    hinweis="Schnitt der letzten Einheit" />
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function Kennzahl({
  label, wert, hinweis,
}: { label: string; wert: string; hinweis?: string }) {
  return (
    <div className="rounded-xl bg-sand/60 p-3">
      <p className="tabular text-lg font-medium text-ink">{wert}</p>
      <p className="text-xs text-ink-muted">{label}</p>
      {hinweis && <p className="mt-0.5 text-[11px] text-ink-faint">{hinweis}</p>}
    </div>
  );
}
