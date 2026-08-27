import { fetchKonfluenzen } from "@/lib/trading/journal";
import { konfluenzAnlegen, konfluenzLoeschen } from "@/lib/journal-actions";
import {
  konfluenzListe, STANDARD_KONFLUENZEN, KONFLUENZEN_MIGRATION_SQL,
} from "@/lib/trading/konfluenzen";
import { KopierFeld } from "@/components/alarm/kopierfeld";
import { Card, CardTitle, Input, Button, Label } from "@/components/ui";

/**
 * Konfluenzen anlegen und wegnehmen.
 *
 * Wie die Kategorien-Karte: in den Einstellungen, weil man so eine Liste
 * selten anfasst und ständig benutzt. Jede Zeile ist ein eigenes Formular,
 * kein Bearbeitungsmodus — bei acht Einträgen wäre das mehr Bedienung als
 * Nutzen.
 *
 * **Setups stehen hier nicht.** Die sind fünf eigene Spalten in `trades`;
 * frei anlegbar hiesse Spalten auf eine Liste umbauen und alle bestehenden
 * Trades migrieren. Konfluenzen liegen dagegen ohnehin schon als Textliste in
 * der Zeile — dort kostet es nichts.
 */
export async function KonfluenzenKarte() {
  const eigene = await fetchKonfluenzen();
  const angezeigt = konfluenzListe(eigene);
  const nochStandard = eigene.length === 0;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Konfluenzen</CardTitle>
        <span className="text-[11px] text-ink-faint">
          {angezeigt.length} im Trade-Formular
        </span>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        {nochStandard
          ? "Noch nichts Eigenes angelegt — es gelten die acht Standardwerte. "
            + "Legst du den ersten eigenen an, werden sie mit übernommen, damit "
            + "dir keine gewohnten Haken verschwinden."
          : "Was hier steht, steht als Haken im Trade-Formular."}
      </p>

      <ul className="flex flex-wrap gap-1.5">
        {eigene.length > 0
          ? eigene.map((k) => (
            <li key={k.id}>
              <form action={konfluenzLoeschen}
                className="flex items-center gap-1.5 rounded-xl bg-sand px-2.5 py-1.5">
                <input type="hidden" name="id" value={k.id} />
                <span className="text-sm text-ink-soft">{k.name}</span>
                <button title="wegnehmen"
                  className="text-xs text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </form>
            </li>
          ))
          : STANDARD_KONFLUENZEN.map((n) => (
            <li key={n} className="rounded-xl bg-sand/60 px-2.5 py-1.5 text-sm text-ink-muted">
              {n}
            </li>
          ))}
      </ul>

      <form action={konfluenzAnlegen} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-44 flex-1">
          <Label htmlFor="kon-neu">Neue Konfluenz</Label>
          <Input id="kon-neu" name="name" required maxLength={40}
            placeholder="z.B. Orderflow" />
        </div>
        <Button type="submit" variant="ghost">Anlegen</Button>
      </form>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Wegnehmen ändert nichts an bestehenden Trades — die tragen den Namen
        als Text, nicht als Verweis. Beim Bearbeiten eines alten Trades taucht
        ein weggenommener Haken deshalb wieder auf, damit er nicht
        stillschweigend verschwindet.
      </p>

      <details className="mt-3 border-t border-line/70 pt-3">
        <summary className="cursor-pointer list-none text-xs text-ink-muted transition hover:text-ink-soft">
          Tabelle fehlt? SQL zum Kopieren
        </summary>
        <p className="mt-2 text-[11px] text-ink-faint">
          Einmal im SQL-Editor der <strong>Trading</strong>-Datenbank ausführen.
        </p>
        <div className="mt-2">
          <KopierFeld text={KONFLUENZEN_MIGRATION_SQL} label="SQL kopieren" />
        </div>
      </details>
    </Card>
  );
}
