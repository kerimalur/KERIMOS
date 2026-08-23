import { fetchKategorien, fetchWatchlist } from "@/lib/supabase/trading";
import { kategorieAendern, kategorieAnlegen, kategorieLoeschen } from "@/lib/trading-actions";
import { FARBEN, farbPunkt, sortiereKategorien } from "@/lib/trading/kategorien";
import { KATEGORIEN_MIGRATION_SQL } from "@/lib/trading/kategorien-migration";
import { KopierFeld } from "@/components/alarm/kopierfeld";
import { Card, CardTitle, Input, Select, Label, Button, Empty, cx } from "@/components/ui";

/**
 * Kategorien anlegen und pflegen — der einzige Ort dafür.
 *
 * Bewusst in den Einstellungen und nicht auf der Übersicht: Kategorien legt
 * man selten an und benutzt sie ständig. Ein Verwaltungsformular neben der
 * Arbeitsliste würde jeden Tag Platz kosten für etwas, das man alle paar
 * Wochen anfasst.
 *
 * Ohne Zauber: jede Zeile ist ein eigenes Formular, das direkt speichert.
 * Kein Bearbeitungsmodus, kein „Änderungen übernehmen" — bei sieben Zeilen
 * wäre das mehr Bedienung als Nutzen.
 */
export async function KategorienKarte() {
  const [kategorien, linien] = await Promise.all([fetchKategorien(), fetchWatchlist()]);
  const sortiert = sortiereKategorien(kategorien);

  const anzahl = (id: string) => linien.filter((l) => l.kategorie_id === id).length;
  const ohne = linien.filter((l) => !l.kategorie_id).length;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Kategorien</CardTitle>
        <span className="text-[11px] text-ink-faint">
          {linien.length} aktive Trades{ohne > 0 && ` · ${ohne} ohne Kategorie`}
        </span>
      </div>

      {sortiert.length === 0 ? (
        <Empty>
          Noch keine Kategorie. Leg unten eine an — die Übersicht und die
          Startseite gruppieren die aktiven Trades danach. Ohne Kategorien
          bleibt alles eine Liste, das ist auch in Ordnung.
        </Empty>
      ) : (
        <ul className="mb-5 space-y-1.5">
          {sortiert.map((k) => (
            <li key={k.id}
              className="flex flex-wrap items-end gap-2 rounded-xl bg-sand/50 px-3 py-2.5">
              <span className={cx("mb-2.5 h-2.5 w-2.5 shrink-0 rounded-full", farbPunkt(k.farbe))} />

              <form action={kategorieAendern} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={k.id} />
                <div>
                  <Label htmlFor={`n-${k.id}`}>Name</Label>
                  <Input id={`n-${k.id}`} name="name" defaultValue={k.name}
                    required className="w-44" />
                </div>
                <div>
                  <Label htmlFor={`f-${k.id}`}>Farbe</Label>
                  <Select id={`f-${k.id}`} name="farbe" defaultValue={k.farbe} className="w-32">
                    {FARBEN.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`s-${k.id}`}>Reihenfolge</Label>
                  <Input id={`s-${k.id}`} name="sort_order" type="number"
                    defaultValue={k.sortOrder} className="w-24" />
                </div>
                <Button type="submit" variant="ghost" className="mb-0">Speichern</Button>
              </form>

              <span className="mb-2.5 ml-auto flex items-center gap-3">
                <span className="text-[11px] text-ink-faint">
                  {anzahl(k.id)} {anzahl(k.id) === 1 ? "Trade" : "Trades"}
                </span>
                <form action={kategorieLoeschen}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">
                    löschen
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={kategorieAnlegen} className="flex flex-wrap items-end gap-2.5">
        <div>
          <Label htmlFor="neu-name">Neue Kategorie</Label>
          <Input id="neu-name" name="name" placeholder="z.B. Diese Woche"
            required className="w-52" />
        </div>
        <div>
          <Label htmlFor="neu-farbe">Farbe</Label>
          <Select id="neu-farbe" name="farbe" defaultValue="accent" className="w-32">
            {FARBEN.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="neu-sort">Reihenfolge</Label>
          <Input id="neu-sort" name="sort_order" type="number" defaultValue={0}
            className="w-24" />
        </div>
        <Button type="submit" variant="ghost">Anlegen</Button>
      </form>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Eine gelöschte Kategorie nimmt keine Trades mit — die Zeilen rutschen
        unter „ohne Kategorie". Die Reihenfolge bestimmt, in welcher Folge die
        Gruppen auf der Übersicht stehen; gleiche Zahl sortiert nach Name.
      </p>

      <details className="mt-4 rounded-xl border border-line/60 bg-sand/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Kategorien einrichten — einmalige Migration
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Kategorien brauchen eine eigene Tabelle und eine Spalte auf
          <code> trading_watchlist</code>. Solange die fehlen, funktioniert die
          Liste ganz normal weiter, nur eben ohne Einteilung — und das Anlegen
          hier oben meldet einen Fehler. SQL kopieren, im Supabase-SQL-Editor
          des Trading-Projekts ausführen, fertig. Ein zweiter Lauf tut nichts.
        </p>
        <div className="mt-3">
          <KopierFeld text={KATEGORIEN_MIGRATION_SQL} />
        </div>
      </details>
    </Card>
  );
}
