"use client";
import { useState, useTransition } from "react";
import { Card, CardTitle, Select, Input, Button, Badge, Empty } from "@/components/ui";
import {
  uebernehmeGarminImport, verwerfeGarminImport, reaktiviereGarminImport,
} from "@/lib/garmin-actions";
import type { GarminVorschau, GarminVerworfen, VorschauGruppe } from "@/lib/supabase/garmin";

/**
 * Prüfschritt vor dem Übernehmen eines Garmin-Trainings.
 *
 * Warum es diesen Schritt gibt: die Uhr kennt das Gewicht an Maschinen oft
 * nicht (0 kg) und wirft ähnliche Übungen zusammen. Beides lässt sich nur hier
 * geradebiegen, bevor die Zahlen im Verlauf und in den Auswertungen landen.
 */

interface Props {
  vorschau: GarminVorschau[];
  exercises: { id: string; name: string }[];
}

/** "2026-08-01T07:15:00+02:00" -> "Fr, 01.08. 07:15" */
function zeitLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS" -> "Incline Dumbbell Bench Press" */
function lesbar(garminKey: string): string {
  const teile = garminKey.split("/");
  const roh = teile[1] || teile[0];
  return roh
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function Gruppe({
  gruppe, exercises,
}: { gruppe: VorschauGruppe; exercises: { id: string; name: string }[] }) {
  const [uebung, setUebung] = useState(gruppe.exerciseId ?? "");
  // Der Vorschlag kam aus dem gespeicherten Mapping - der muss nicht nochmal
  // gemerkt werden. Neu zugeordnete oder korrigierte Übungen dagegen schon.
  const [merkeDauerhaft, setMerkeDauerhaft] = useState(!gruppe.exerciseId);

  // Ein Feld, das alle Sätze der Gruppe auf einmal füllt. Genau der Fall, den
  // Kerim ständig hat: dieselbe Maschine, dasselbe Gewicht, drei Sätze.
  const [alle, setAlle] = useState("");

  const ohneGewicht = gruppe.saetze.filter((s) => s.weight_kg === 0).length;

  return (
    <div className="rounded-xl bg-sand px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-muted">{lesbar(gruppe.garminKey)}</span>
        <Badge>{gruppe.saetze.length} Sätze</Badge>
        {!gruppe.exerciseId && <Badge tone="bad">nicht zugeordnet</Badge>}
        {ohneGewicht > 0 && <Badge tone="bad">{ohneGewicht}× ohne Gewicht</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          name={`uebung__${gruppe.garminKey}`}
          value={uebung}
          onChange={(e) => setUebung(e.target.value)}
          className="sm:max-w-[18rem]"
        >
          <option value="">— auslassen —</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input
            type="checkbox"
            name={`merken__${gruppe.garminKey}`}
            checked={merkeDauerhaft}
            onChange={(e) => setMerkeDauerhaft(e.target.checked)}
            className="accent-accent"
          />
          dauerhaft merken
        </label>
      </div>

      <div className="mt-3 space-y-1.5">
        {gruppe.saetze.map((satz, i) => (
          <div key={satz.id} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-ink-muted">{i + 1}.</span>
            <Input
              type="number" step="0.5" min="0" inputMode="decimal"
              name={`gewicht__${satz.id}`}
              defaultValue={satz.weight_kg || ""}
              placeholder="kg"
              aria-label={`Gewicht Satz ${i + 1}`}
              className={satz.weight_kg === 0 ? "border-bad/50" : undefined}
            />
            <span className="shrink-0 text-xs text-ink-muted">kg ×</span>
            <Input
              type="number" min="0" inputMode="numeric"
              name={`reps__${satz.id}`}
              defaultValue={satz.reps || ""}
              placeholder="Wdh"
              aria-label={`Wiederholungen Satz ${i + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number" step="0.5" min="0" inputMode="decimal"
          value={alle}
          onChange={(e) => {
            const wert = e.target.value;
            setAlle(wert);
            // Direkt in die Felder schreiben statt sie kontrolliert zu machen:
            // so bleiben die Einzelfelder frei editierbar, wenn ein Satz
            // ausnahmsweise abweicht.
            for (const satz of gruppe.saetze) {
              const feld = document.getElementsByName(
                `gewicht__${satz.id}`,
              )[0] as HTMLInputElement | undefined;
              if (feld) feld.value = wert;
            }
          }}
          placeholder="Gewicht für alle Sätze"
          className="sm:max-w-[14rem]"
        />
      </div>
    </div>
  );
}

export function GarminVorschauPanel({ vorschau, exercises }: Props) {
  if (vorschau.length === 0) {
    return (
      <Card>
        <CardTitle>Zu prüfen</CardTitle>
        <Empty>
          Nichts offen. Neue Trainings landen nach dem Sync hier, bevor sie in den
          Verlauf wandern.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {vorschau.map((v) => (
        <Card key={v.id}>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto">{zeitLabel(v.started_at)}</CardTitle>
            {v.erkannter_split && (
              <Badge>{v.erkannter_split === "push" ? "Push" : "Pull"}</Badge>
            )}
            {v.ohneGewicht > 0 && (
              <Badge tone="bad">{v.ohneGewicht} Sätze ohne Gewicht</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Gewichte prüfen und Übungen zuordnen — erst danach landet das Training
            im Verlauf.
          </p>

          <form action={uebernehmeGarminImport} className="mt-3 space-y-3">
            <input type="hidden" name="importId" value={v.id} />
            {v.gruppen.map((g) => (
              <Gruppe key={g.garminKey} gruppe={g} exercises={exercises} />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">In den Verlauf übernehmen</Button>
            </div>
          </form>

          <form action={verwerfeGarminImport} className="mt-2">
            <input type="hidden" name="importId" value={v.id} />
            <button
              type="submit"
              className="text-xs text-ink-muted transition hover:text-ink"
            >
              verwerfen
            </button>
          </form>
        </Card>
      ))}
    </div>
  );
}

/**
 * Zuletzt verworfene Trainings mit "erneut versuchen".
 *
 * Warum es das braucht: "verwerfen" blockiert die garmin_activity_id dauerhaft
 * gegen künftige Syncs (Absicht: kein Alert-Sturm auf längst Verworfenes) -
 * das trifft aber auch den Fall, dass Kerim die Einheit auf der Uhr/App noch
 * korrigiert hat und sie einfach nochmal haben will. Der Knopf gibt genau
 * diesen einen Eintrag frei und stösst sofort einen neuen Sync an.
 */
export function GarminVerworfenPanel({ items }: { items: GarminVerworfen[] }) {
  const [meldung, setMeldung] = useState<Record<string, string>>({});
  const [laufendeId, setLaufendeId] = useState<string | null>(null);
  const [, starte] = useTransition();

  if (items.length === 0) return null;

  function erneutVersuchen(id: string) {
    const fd = new FormData();
    fd.set("importId", id);
    setLaufendeId(id);
    starte(async () => {
      const text = await reaktiviereGarminImport(fd);
      setMeldung((m) => ({ ...m, [id]: text }));
      setLaufendeId(null);
    });
  }

  return (
    <Card>
      <CardTitle>Zuletzt verworfen</CardTitle>
      <p className="mb-3 text-xs text-ink-muted">
        Kommen beim normalen Sync nicht zurück. "Erneut versuchen" gibt die
        Aktivität frei und synchronisiert sofort neu - nützlich, wenn du das
        Training auf der Uhr oder in der App danach noch korrigiert hast.
      </p>
      <ul className="divide-y divide-line">
        {items.map((v) => (
          <li key={v.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink">{zeitLabel(v.started_at)}</span>
              {v.garmin_uebersicht && (
                <span className="min-w-0 truncate text-xs text-ink-muted">
                  {v.garmin_uebersicht}
                </span>
              )}
              <Button
                variant="ghost"
                className="ml-auto px-2.5 py-1 text-xs"
                onClick={() => erneutVersuchen(v.id)}
                disabled={laufendeId === v.id}
              >
                {laufendeId === v.id ? "…" : "erneut versuchen"}
              </Button>
            </div>
            {meldung[v.id] && (
              <p className="mt-1 text-xs text-ink-soft">{meldung[v.id]}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
