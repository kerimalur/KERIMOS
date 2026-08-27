import { alarmStumm, alarmScharf } from "@/lib/alarm-actions";
import { removeWatchlistPair } from "@/lib/trading-actions";
import { ART_LABEL, type Alarmart } from "@/lib/alarm/regeln";
import type { AlarmZeile } from "@/lib/alarm/uebersicht";
import { Card, CardTitle, Badge, cx } from "@/components/ui";

/**
 * Welche Linien demnächst eine Nachricht auslösen — und welche schon eine
 * ausgelöst haben.
 *
 * Bis zum 27.08.2026 waren die Alarme unsichtbar: man sah erst, dass eine
 * Linie meldet, wenn sie meldete. Seit die Sperre endgültig ist, kommt eine
 * zweite Frage dazu, die man vorher gar nicht stellen konnte — *hat die hier
 * schon gefeuert?*
 *
 * Sortiert nach Abstand: was am nächsten dran ist, steht oben. Danach sucht
 * man auf dieser Seite.
 */
function ArtZeile({ zeile, art }: { zeile: AlarmZeile; art: Alarmart }) {
  const gemeldetAm = zeile.gemeldet[art];
  const scharf = !gemeldetAm;

  return (
    <span className="flex items-center gap-1.5">
      <Badge tone={scharf ? "good" : "neutral"}>
        {ART_LABEL[art]}: {scharf ? "scharf" : "still"}
      </Badge>
      {scharf ? (
        <form action={alarmStumm}>
          <input type="hidden" name="id" value={zeile.id} />
          <input type="hidden" name="art" value={art} />
          <button className="text-[11px] text-ink-faint transition hover:text-warn">
            stumm
          </button>
        </form>
      ) : (
        <form action={alarmScharf}>
          <input type="hidden" name="id" value={zeile.id} />
          <input type="hidden" name="art" value={art} />
          <button className="text-[11px] text-ink-faint transition hover:text-good"
            title={`gemeldet am ${gemeldetAm}`}>
            wieder scharf
          </button>
        </form>
      )}
    </span>
  );
}

export function AlarmUebersichtKarte({ zeilen }: { zeilen: AlarmZeile[] }) {
  if (zeilen.length === 0) {
    return (
      <Card>
        <CardTitle>Was demnächst meldet</CardTitle>
        <p className="text-sm text-ink-muted">
          Keine Beobachtungs-Linie hat gerade einen Alarm gesetzt. Alarme
          entstehen auf der Übersicht, wenn du eine Linie mit „bei Treffer"
          oder einer Uhrzeit anlegst.
        </p>
      </Card>
    );
  }

  const scharf = zeilen.filter(
    (z) => z.arten.some((a) => !z.gemeldet[a])).length;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <CardTitle className="mb-0">Was demnächst meldet</CardTitle>
        <span className="text-xs text-ink-muted">
          {scharf} von {zeilen.length} {zeilen.length === 1 ? "Linie" : "Linien"} scharf
        </span>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Jede Linie meldet <strong>einmal</strong>, dann nie wieder. „stumm"
        setzt die Sperre von Hand, „wieder scharf" nimmt sie zurück.
      </p>

      <ul className="divide-y divide-line">
        {zeilen.map((z) => (
          <li key={z.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="font-medium text-ink">{z.pair}</span>
            {z.side && (
              <Badge tone={z.side === "long" ? "good" : "bad"}>
                {z.side.toUpperCase()}
              </Badge>
            )}
            {z.level !== null && (
              <span className="tabular text-xs text-ink-muted">@ {z.level}</span>
            )}

            {z.bereitsGetroffen ? (
              <Badge tone="bad">erreicht</Badge>
            ) : z.pips !== null ? (
              <span className={cx("tabular text-xs",
                z.pips <= 20 ? "text-warn" : "text-ink-soft")}>
                {Math.round(z.pips)} Pips
              </span>
            ) : (
              <Badge tone="neutral">kein Live-Preis</Badge>
            )}

            {z.zeit && <Badge tone="neutral">{z.zeit}</Badge>}

            <span className="ml-auto flex flex-wrap items-center gap-2.5">
              {z.arten.map((art) => <ArtZeile key={art} zeile={z} art={art} />)}
              <form action={removeWatchlistPair}>
                <input type="hidden" name="id" value={z.id} />
                <button className="text-[11px] text-ink-faint transition hover:text-bad">
                  Linie löschen
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-ink-faint">
        „still" heisst nicht, dass etwas kaputt ist — eine Linie, die gemeldet
        hat, bleibt still. Willst du dieselbe Linie noch einmal beobachten,
        nimm „wieder scharf". <strong>Linie löschen</strong> entfernt sie ganz,
        auch von der Trading-Übersicht.
      </p>
    </Card>
  );
}
