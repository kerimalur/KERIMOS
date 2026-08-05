"use client";
import { useState, useTransition } from "react";
import { Card, CardTitle, Select, Button, Badge, Empty } from "@/components/ui";
import { saveGarminMapping, deleteGarminMapping, triggerGarminSync } from "@/lib/garmin-actions";
import type { GarminMapping, GarminSession, GarminTag } from "@/lib/supabase/garmin";

interface Props {
  exercises: { id: string; name: string }[];
  mappings: GarminMapping[];
  unmapped: { key: string; saetze: number }[];
  sessions: GarminSession[];
  tage: GarminTag[];
}

const zahl = (v: number | null) => (v === null ? "—" : v.toLocaleString("de-CH"));

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

export function GarminPanel({ exercises, mappings, unmapped, sessions, tage }: Props) {
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const sync = () => {
    starte(async () => {
      setMeldung(null);
      setMeldung(await triggerGarminSync());
    });
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ Sync auslösen */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Garmin-Import</CardTitle>
            <p className="mt-1 text-xs text-ink-muted">
              Läuft automatisch jeden Abend. Neue Trainings landen oben zur Prüfung,
              nicht direkt im Verlauf.
            </p>
          </div>
          <Button onClick={sync} disabled={laeuft}>
            {laeuft ? "Synchronisiert…" : "Jetzt synchronisieren"}
          </Button>
        </div>
        {meldung && (
          <p className="mt-3 rounded-lg bg-sand px-3 py-2 text-sm text-ink-soft">{meldung}</p>
        )}
      </Card>

      {/* ------------------------------- Altlasten aus früheren Imports */}
      <Card>
        <CardTitle>Nicht zugeordnet (Altbestand)</CardTitle>
        {unmapped.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Alles zugeordnet — jede Garmin-Übung landet aktuell in der richtigen Übung.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-muted">
              Aus Sessions, die noch ohne Prüfschritt importiert wurden. Neue Trainings
              werden stattdessen oben in der Vorschau zugeordnet.
            </p>
            <ul className="mt-3 space-y-2">
              {unmapped.map((u) => (
                <li key={u.key}>
                  <form
                    action={saveGarminMapping}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-sand px-3 py-2"
                  >
                    <input type="hidden" name="garminKey" value={u.key} />
                    <span className="font-mono text-xs text-ink">{u.key}</span>
                    <Badge>{u.saetze} Sätze</Badge>
                    <Select
                      name="exerciseId" required defaultValue=""
                      className="ml-auto sm:max-w-[16rem]"
                    >
                      <option value="" disabled>Übung wählen…</option>
                      {exercises.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </Select>
                    <Button type="submit">Zuordnen</Button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* ------------------------------------------ Bestehende Zuordnungen */}
      <Card>
        <CardTitle>Zuordnungen ({mappings.length})</CardTitle>
        {mappings.length === 0 ? (
          <Empty>Noch keine Zuordnungen.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {mappings.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className="font-mono text-xs text-ink-muted">
                  {m.garmin_category}
                  {m.garmin_name !== "*" && `/${m.garmin_name}`}
                </span>
                <span className="text-ink-muted">→</span>
                <span className="text-sm text-ink">{m.exercise_name ?? "—"}</span>
                <form action={deleteGarminMapping} className="ml-auto">
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="text-xs text-ink-muted transition hover:text-ink"
                  >
                    entfernen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --------------------------------------- Schritte und Kalorien */}
      <Card>
        <CardTitle>Tagesdaten</CardTitle>
        {tage.length === 0 ? (
          <Empty>Noch keine Tagesdaten. Kommen beim nächsten Sync.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="pb-2 pr-3 font-medium">Tag</th>
                  <th className="pb-2 pr-3 text-right font-medium">Schritte</th>
                  <th className="pb-2 pr-3 text-right font-medium">kcal ges.</th>
                  <th className="pb-2 pr-3 text-right font-medium">kcal aktiv</th>
                  <th className="pb-2 pr-3 text-right font-medium">Ruhepuls</th>
                  <th className="pb-2 text-right font-medium">Body Batt.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tage.map((t) => (
                  <tr key={t.datum}>
                    <td className="py-2 pr-3 text-ink">
                      {new Date(t.datum).toLocaleDateString("de-CH", {
                        weekday: "short", day: "2-digit", month: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{zahl(t.schritte)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {zahl(t.kalorien_gesamt)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-muted">
                      {zahl(t.kalorien_aktiv)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{zahl(t.ruhepuls)}</td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">
                      {t.body_battery_tiefster === null && t.body_battery_hoechster === null
                        ? "—"
                        : `${zahl(t.body_battery_tiefster)}–${zahl(t.body_battery_hoechster)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          &bdquo;kcal ges.&ldquo; ist Grundumsatz plus Aktivität — die Zahl, gegen die
          du deine Zufuhr rechnen willst.
        </p>
      </Card>

      {/* ------------------------------------------- Zuletzt importiert */}
      <Card>
        <CardTitle>Zuletzt importiert</CardTitle>
        {sessions.length === 0 ? (
          <Empty>Noch keine Garmin-Session importiert.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-ink">{zeitLabel(s.started_at)}</span>
                <Badge>{s.saetze} Sätze</Badge>
                {s.notes?.includes("Unmapped") && (
                  <span className="text-xs text-ink-muted">enthält nicht zugeordnete Übungen</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
