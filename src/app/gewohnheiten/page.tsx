import Link from "next/link";
import { ladeGewohnheitenMitRaster, GEWOHNHEITEN_SQL } from "@/lib/gewohnheiten";
import {
  gewohnheitAnlegen, gewohnheitAendern, gewohnheitArchivieren,
} from "@/lib/gewohnheiten-actions";
import { Eintragen } from "@/components/gewohnheiten-karte";
import { GewohnheitenRaster } from "@/components/gewohnheiten-raster";
import {
  Button, Card, CardTitle, Empty, Input, Label, Select, Stat,
} from "@/components/ui";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Gewohnheiten — anlegen, eintragen, nachtragen, nachsehen.
 *
 * Die Seite beantwortet eine Frage je Gewohnheit: wie oft. Es gibt bewusst
 * keine Auswertung darüber hinaus — keine Korrelationen, keine Tageszeit,
 * keine Bewertung der Serie. Der Gym-Bereich hatte all das und es hat nie eine
 * Entscheidung verändert; was blieb, war der Erfassungsaufwand.
 *
 * Der tägliche Weg führt gar nicht hierher: eingetragen wird auf der
 * Startseite und im Gym-Bereich. Hier steht der Verlauf — Monat für Monat,
 * beliebig weit zurück — und die Verwaltung.
 */
export default async function GewohnheitenPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat } = await searchParams;
  const { gewohnheiten, tabelleFehlt } = await ladeGewohnheitenMitRaster(monat);
  const heute = heuteISO();

  return (
    <div className="py-6">
      <div className="mb-5">
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">
          Gewohnheiten
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Was getan wurde, und wie oft. Im Raster lässt sich ein vergangener Tag
          nachtragen — der Montag, der am Mittwoch auffällt, soll nicht für
          immer fehlen. Mit ‹ und › blätterst du durch die Monate.
        </p>
      </div>

      {tabelleFehlt ? (
        <Card>
          <CardTitle>Tabellen fehlen noch</CardTitle>
          <p className="text-sm text-ink-muted">
            Führe <code className="rounded bg-sand px-1 py-0.5 text-xs">
              supabase/migrations/19_habits.sql
            </code> und danach <code className="rounded bg-sand px-1 py-0.5 text-xs">
              20_habits_varianten.sql
            </code> im SQL-Editor aus, dann läuft die Seite. Beides zusammen
            ergibt den Stand unten — zum Kopieren:
          </p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-sand p-4 text-xs
                          leading-relaxed text-ink-soft">
            {GEWOHNHEITEN_SQL}
          </pre>
        </Card>
      ) : (
        <div className="space-y-5">
          {gewohnheiten.length === 0 ? (
            <Empty>
              Noch keine Gewohnheit. Leg unten die erste an — Gym ist der
              naheliegende Anfang.
            </Empty>
          ) : (
            gewohnheiten.map((h) => (
              <Card key={h.id}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">
                    {h.icon && <span className="mr-2">{h.icon}</span>}
                    {h.name}
                  </h2>
                  <span className="text-xs text-ink-faint">
                    {h.bereich === "gym" ? "im Gym-Bereich" : "auf der Startseite"}
                    {h.varianten.length > 0 && ` · ${h.varianten.join(", ")}`}
                  </span>
                </div>

                <div className="mb-5">
                  <Eintragen h={h} heute={heute} />
                </div>

                <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Diese Woche"
                      value={h.zielProWoche > 0
                        ? `${h.dieseWoche} / ${h.zielProWoche}`
                        : String(h.dieseWoche)}
                      sub={h.wocheNachVariante.length > 0
                        ? h.wocheNachVariante
                            .map((v) => `${v.anzahl}× ${v.variante}`).join(" · ")
                        : undefined}
                      tone={h.zielProWoche > 0 && h.dieseWoche >= h.zielProWoche
                        ? "good" : "neutral"} />
                    <Stat label="Letzte 30 Tage" value={String(h.dreissigTage)} />
                    <Stat label="Am Stück" value={String(h.streak)}
                      sub={h.streak === 1 ? "Tag" : "Tage"} />
                    <Stat label="Insgesamt" value={String(h.gesamt)}
                      sub="Einheiten" />
                  </div>

                  <div className="sm:w-64">
                    <GewohnheitenRaster h={h} />
                  </div>
                </div>

                {/* Ändern und Archivieren stehen unten und klein: sie sind
                    nicht der Grund, warum man die Seite aufmacht. */}
                <details className="mt-5 border-t border-line/50 pt-3">
                  <summary className="cursor-pointer text-xs text-ink-muted
                                      transition hover:text-ink-soft">
                    Ändern
                  </summary>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <form action={gewohnheitAendern}
                      className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={h.id} />
                      <Felder h={h} suffix={h.id} />
                      <Button type="submit" variant="ghost">Speichern</Button>
                    </form>

                    <form action={gewohnheitArchivieren}>
                      <input type="hidden" name="id" value={h.id} />
                      <Button type="submit" variant="danger">Archivieren</Button>
                    </form>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Archivieren blendet die Gewohnheit aus, löscht aber keinen
                    einzigen eingetragenen Tag.
                  </p>
                </details>
              </Card>
            ))
          )}

          <Card>
            <CardTitle>Neue Gewohnheit</CardTitle>
            <form action={gewohnheitAnlegen} className="flex flex-wrap items-end gap-3">
              <Felder h={null} suffix="neu" />
              <Button type="submit">Anlegen</Button>
            </form>
            <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-ink-faint">
              <strong className="text-ink-muted">Mit Datum</strong> heisst: beim
              Eintragen fragt ein Dialog erst nach dem Tag — für alles, was man
              nachträgt statt im Moment abzuhaken, etwa ein Training. Ohne
              Datum genügt ein Druck und der Tag ist heute.{" "}
              <strong className="text-ink-muted">Varianten</strong> unterteilen
              eine Gewohnheit (beim Gym: Push, Pull, Ausdauer). Sie erscheinen
              im selben Dialog, und mehrere an einem Tag sind erlaubt.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Die Felder einer Gewohnheit — einmal geschrieben, zweimal benutzt.
 *
 * Anlegen und Ändern müssen dieselben Felder haben, sonst kann man beim
 * Anlegen etwas nicht setzen, das man danach nur über den Umweg „anlegen,
 * dann ändern" erreicht. Genau so entstehen Formulare, die auseinanderlaufen.
 */
function Felder({
  h, suffix,
}: {
  h: {
    name: string; icon: string | null; zielProWoche: number; bereich: string;
    varianten: string[]; mitDatum: boolean; farbe: string;
  } | null;
  suffix: string;
}) {
  const id = (feld: string) => `${feld}-${suffix}`;

  return (
    <>
      <div>
        <Label htmlFor={id("name")}>Name</Label>
        <Input id={id("name")} name="name" required defaultValue={h?.name}
          placeholder="Lesen" className="w-40" />
      </div>
      <div>
        <Label htmlFor={id("icon")}>Zeichen</Label>
        <Input id={id("icon")} name="icon" maxLength={2} defaultValue={h?.icon ?? ""}
          placeholder="📖" className="w-16" />
      </div>
      <div>
        <Label htmlFor={id("ziel")}>Ziel / Woche</Label>
        <Select id={id("ziel")} name="ziel_pro_woche"
          defaultValue={String(h?.zielProWoche ?? 0)} className="w-28">
          <option value="0">kein Ziel</option>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n}×</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={id("bereich")}>Steht bei</Label>
        <Select id={id("bereich")} name="bereich" defaultValue={h?.bereich ?? "allgemein"}
          className="w-32">
          <option value="allgemein">Startseite</option>
          <option value="gym">Gym</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={id("mit_datum")}>Eintragen</Label>
        <Select id={id("mit_datum")} name="mit_datum"
          defaultValue={h?.mitDatum ? "1" : "0"} className="w-36">
          <option value="0">ein Druck = heute</option>
          <option value="1">mit Datum fragen</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={id("varianten")}>Varianten</Label>
        <Input id={id("varianten")} name="varianten"
          defaultValue={h?.varianten.join(", ") ?? ""}
          placeholder="Push, Pull, Ausdauer" className="w-52" />
      </div>
      <div>
        <Label htmlFor={id("farbe")}>Farbe</Label>
        <Input id={id("farbe")} name="color" type="color"
          defaultValue={h?.farbe ?? "#9A8C74"} className="h-9 w-14 p-1" />
      </div>
    </>
  );
}
