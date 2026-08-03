import { createClient } from "@/lib/supabase/server";
import { heuteISO, ZONE } from "@/lib/time";

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Art = "arbeit" | "training" | "essen" | "termin" | "aufgabe";

interface Block {
  id: string;
  /** Beginn in Minuten seit Mitternacht. */
  von: number;
  /** Ende in Minuten. NULL heisst: Zeitpunkt ohne bekannte Dauer. */
  bis: number | null;
  titel: string;
  art: Art;
}

const FARBE: Record<Art, string> = {
  arbeit: "#378ADD",
  training: "#639922",
  essen: "#BA7517",
  termin: "#D85A30",
  aufgabe: "#9A8C74",
};

/** Höhe einer Spur in Pixeln - Balken plus Luft darunter. */
const SPUR = 30;

/**
 * Der Tag als Zeitachse.
 *
 * Drei Festlegungen, die den Strahl von der früheren Punktreihe unterscheiden:
 *
 *   1. Die Skala beginnt beim Aufstehen, nicht bei der ersten Eintragung und
 *      auch nicht um 00:00. Ein Termin um 09:00 steht damit dort, wo er im
 *      Tag wirklich liegt - vorne.
 *   2. Alles mit bekanntem Ende ist ein Balken, kein Punkt. Ein Termin von
 *      09:00 bis 16:30 frisst den Tag, und genau so sieht er dann auch aus.
 *   3. Nicht nur Kalendertermine: Arbeit, Training und Essen aus der
 *      Zeiterfassung stehen mit drauf, dazu die heute fälligen Aufgaben.
 *      Aufgaben haben keine Uhrzeit und stehen deshalb als Zeile darunter -
 *      erfunden wird keine Zeit.
 *
 * Überschneidungen landen in eigenen Spuren, damit sich nichts überdeckt.
 */
export async function Tagesstrahl() {
  const supabase = await createClient();
  const heute = heuteISO();

  const [
    { data: entries }, { data: activities }, { data: termine }, { data: aufgaben },
  ] = await Promise.all([
    supabase.from("time_entries")
      .select("id, activity_id, minutes, start_minute").eq("entry_date", heute),
    supabase.from("activities").select("id, name, bucket, is_sleep"),
    supabase.from("appointments")
      .select("id, title, start_minute, end_minute").eq("starts_on", heute),
    supabase.from("tasks")
      .select("id, title, due_on").is("done_at", null).lte("due_on", heute),
  ]);

  const akt = new Map(
    (activities ?? []).map((a) => [
      a.id as string,
      {
        name: a.name as string,
        bucket: (a.bucket as string | null) ?? "",
        schlaf: Boolean(a.is_sleep),
      },
    ]),
  );

  const bloecke: Block[] = [];

  // Wann der Tag begonnen hat: das Ende des heutigen Schlafeintrags. logSleep
  // legt über Mitternacht zwei Zeilen an - die heutige beginnt bei 0.
  let aufstehen: number | null = null;

  for (const e of entries ?? []) {
    const start = e.start_minute as number | null;
    if (start === null) continue;
    const a = akt.get(e.activity_id as string);
    if (!a) continue;

    const dauer = Number(e.minutes) || 0;

    if (a.schlaf) {
      // Nur Morgenschlaf zählt als Aufstehzeit - ein Mittagsschlaf oder der
      // Beginn der heutigen Nacht darf den Tagesanfang nicht verschieben.
      const ende = start + dauer;
      if (start === 0 || ende <= 12 * 60) {
        aufstehen = Math.max(aufstehen ?? 0, ende);
      }
      continue;
    }

    const art: Art | null =
      a.bucket === "arbeit" ? "arbeit"
        : /training|gym|sport|lauf/i.test(a.name) ? "training"
          : /essen|mahlzeit|kochen/i.test(a.name) ? "essen"
            : null;
    if (!art) continue;

    bloecke.push({
      id: e.id as string,
      von: start,
      bis: dauer > 0 ? Math.min(1440, start + dauer) : null,
      titel: a.name,
      art,
    });
  }

  for (const t of termine ?? []) {
    if (t.start_minute === null) continue;
    const von = Number(t.start_minute);
    const bis = t.end_minute === null ? null : Number(t.end_minute);
    bloecke.push({
      id: t.id as string,
      von,
      bis: bis !== null && bis > von ? Math.min(1440, bis) : null,
      titel: t.title as string,
      art: "termin",
    });
  }

  // Aufgaben ohne Uhrzeit - Einkaufen, laufen gehen, anrufen. Sie gehören auf
  // den Tag, aber nicht auf eine Minute.
  const offeneAufgaben = (aufgaben ?? [])
    .map((t) => ({ id: t.id as string, titel: t.title as string }))
    .slice(0, 6);

  if (bloecke.length === 0 && offeneAufgaben.length === 0) return null;

  const jetztTeile = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const jetzt =
    Number(jetztTeile.find((t) => t.type === "hour")?.value ?? 0) * 60 +
    Number(jetztTeile.find((t) => t.type === "minute")?.value ?? 0);

  // Stehen nur Aufgaben an, braucht es keine Achse - dann bleibt die Zeile
  // mit den Aufgaben allein stehen.
  if (bloecke.length === 0) {
    return (
      <div className="mb-7">
        <AufgabenZeile aufgaben={offeneAufgaben} />
      </div>
    );
  }

  bloecke.sort((a, b) => a.von - b.von || (a.bis ?? a.von) - (b.bis ?? b.von));

  // Skalenanfang: Aufstehzeit. Ist sie unbekannt, die volle Stunde vor dem
  // ersten Eintrag - besser eine Stunde zu früh als ein Balken, der links
  // aus dem Bild läuft.
  const ersterEintrag = bloecke[0].von;
  const start = Math.max(
    0,
    aufstehen !== null
      ? Math.min(aufstehen, ersterEintrag)
      : Math.floor(ersterEintrag / 60) * 60,
  );

  const letzterEintrag = Math.max(...bloecke.map((b) => b.bis ?? b.von));
  const ende = Math.min(
    1440,
    Math.max(letzterEintrag + 45, jetzt + 30, start + 6 * 60),
  );
  const spanne = Math.max(60, ende - start);

  const pct = (m: number) =>
    Math.min(100, Math.max(0, ((m - start) / spanne) * 100));

  // Spuren: jeder Block kommt in die erste Zeile, in der er niemanden
  // überdeckt. Punkte bekommen eine gedachte Mindestbreite, damit sich ihre
  // Beschriftungen nicht überlagern.
  const MIN_ABSTAND = Math.round(spanne * 0.16);
  const spurEnde: number[] = [];
  const spurVon: number[] = [];
  for (const b of bloecke) {
    const platz = Math.max(b.bis ?? b.von, b.von + MIN_ABSTAND);
    let spur = spurEnde.findIndex((e) => e <= b.von);
    if (spur === -1) {
      spur = spurEnde.length;
      spurEnde.push(platz);
    } else {
      spurEnde[spur] = platz;
    }
    spurVon.push(spur);
  }
  const spuren = spurEnde.length;

  // Stundenraster: bei langen Tagen nur jede zweite Stunde beschriften.
  const schritt = spanne > 10 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let m = Math.ceil(start / schritt) * schritt; m < ende; m += schritt) {
    ticks.push(m);
  }

  const jetztSichtbar = jetzt >= start && jetzt <= ende;
  const hoehe = spuren * SPUR;

  return (
    <div className="mb-7">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="tabular text-[10px] font-medium text-ink-muted">
          {aufstehen !== null ? `aufgestanden ${hhmm(start)}` : `ab ${hhmm(start)}`}
        </span>
        <span className="tabular text-[10px] font-medium text-ink-muted">
          {hhmm(ende)}
        </span>
      </div>

      <div className="relative" style={{ height: hoehe }}>
        {/* Stundenraster im Hintergrund */}
        {ticks.map((m) => (
          <div key={`t${m}`} className="absolute inset-y-0 w-px bg-line/60"
            style={{ left: `${pct(m)}%` }} />
        ))}

        {bloecke.map((b, i) => {
          const spur = spurVon[i];
          const links = pct(b.von);
          const farbe = FARBE[b.art];

          if (b.bis !== null) {
            const breite = Math.max(pct(b.bis) - links, 1.5);
            return (
              <div key={b.id}
                className="absolute flex items-center overflow-hidden rounded-md px-1.5"
                style={{
                  left: `${links}%`, width: `${breite}%`,
                  top: spur * SPUR, height: 22,
                  background: farbe + "2E",
                  borderLeft: `2px solid ${farbe}`,
                }}>
                <span className="truncate text-[10px] font-medium text-ink">
                  {b.titel}
                </span>
                <span className="tabular ml-1.5 shrink-0 text-[10px] text-ink-muted">
                  {hhmm(b.von)}–{hhmm(b.bis)}
                </span>
              </div>
            );
          }

          // Zeitpunkt: eine Pille, die sich an den Rändern selbst
          // hereinschiebt (Verschiebung wächst mit der Position).
          return (
            <div key={b.id}
              className="absolute flex items-center gap-1 whitespace-nowrap rounded-md
                         border px-1.5"
              style={{
                left: `${links}%`, transform: `translateX(-${links}%)`,
                top: spur * SPUR, height: 22,
                background: farbe + "22", borderColor: farbe + "66",
              }}>
              <span className="tabular text-[10px] font-medium text-ink">
                {hhmm(b.von)}
              </span>
              <span className="max-w-[7rem] truncate text-[10px] text-ink-muted">
                {b.titel}
              </span>
            </div>
          );
        })}

        {/* Wo der Tag gerade steht */}
        {jetztSichtbar && (
          <div className="absolute inset-y-0 w-0.5 rounded bg-bad-bright"
            style={{ left: `${pct(jetzt)}%` }} />
        )}
      </div>

      {/* Grundlinie unter allen Spuren */}
      <div className="h-0.5 rounded-full bg-line-strong" />

      {/* Stundenbeschriftung unter der Linie */}
      <div className="relative mt-1 h-3">
        {ticks.map((m) => (
          <span key={`l${m}`}
            className="tabular absolute text-[9px] text-ink-faint"
            style={{ left: `${pct(m)}%`, transform: `translateX(-${pct(m)}%)` }}>
            {hhmm(m)}
          </span>
        ))}
      </div>

      <AufgabenZeile aufgaben={offeneAufgaben} />
    </div>
  );
}

/**
 * Was heute ansteht, aber keine Uhrzeit hat. Bewusst unter der Achse: eine
 * erfundene Uhrzeit auf dem Strahl wäre eine Lüge über den Tag.
 */
function AufgabenZeile({ aufgaben }: { aufgaben: { id: string; titel: string }[] }) {
  if (aufgaben.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-ink-faint">ohne feste Zeit</span>
      {aufgaben.map((a) => (
        <span key={a.id}
          className="rounded-md border border-line/70 bg-card px-1.5 py-0.5
                     text-[10px] text-ink-soft">
          {a.titel}
        </span>
      ))}
    </div>
  );
}
