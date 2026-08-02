import { createClient } from "@/lib/supabase/server";
import { heuteISO, ZONE } from "@/lib/time";

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

interface Anker {
  id: string;
  minute: number;
  titel: string;
  art: "arbeit" | "training" | "essen" | "termin";
}

const FARBE: Record<Anker["art"], string> = {
  arbeit: "#378ADD",
  training: "#639922",
  essen: "#BA7517",
  termin: "#D85A30",
};

/**
 * Die Ankerpunkte des Tages auf einer Linie.
 *
 * Bewusst keine Blöcke und keine erfasste Zeit: Der Strahl beantwortet
 * "wann muss ich wo sein", nicht "wie habe ich den Tag verbracht". Letzteres
 * gehört in den Zeit-Bereich.
 *
 * Die Skala läuft vom ersten bis zum letzten Punkt, nicht von 5 bis 24 Uhr.
 * Bei fixer Skala klumpen alle Punkte in der Mitte und die Ränder bleiben
 * leer - so nutzt die Linie immer ihre volle Breite.
 */
export async function Tagesstrahl() {
  const supabase = await createClient();
  const heute = heuteISO();

  const [{ data: entries }, { data: activities }, { data: termine }] = await Promise.all([
    supabase.from("time_entries")
      .select("id, activity_id, minutes, start_minute").eq("entry_date", heute),
    supabase.from("activities").select("id, name, bucket, is_sleep"),
    supabase.from("appointments")
      .select("id, title, start_minute").eq("starts_on", heute),
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

  const anker: Anker[] = [];

  for (const e of entries ?? []) {
    const start = e.start_minute as number | null;
    if (start === null) continue;
    const a = akt.get(e.activity_id as string);
    if (!a || a.schlaf) continue;

    // Nur die Ankerpunkte, nicht jeder erfasste Eintrag. Alles andere
    // würde die Linie zumüllen.
    const art: Anker["art"] | null =
      a.bucket === "arbeit" ? "arbeit"
        : /training|gym|sport/i.test(a.name) ? "training"
          : /essen|mahlzeit|kochen/i.test(a.name) ? "essen"
            : null;
    if (!art) continue;

    anker.push({ id: e.id as string, minute: start, titel: a.name, art });
  }

  for (const t of termine ?? []) {
    if (t.start_minute === null) continue;
    anker.push({
      id: t.id as string,
      minute: Number(t.start_minute),
      titel: t.title as string,
      art: "termin",
    });
  }

  if (anker.length < 2) return null;

  anker.sort((a, b) => a.minute - b.minute);

  // Skala von erstem bis letztem Punkt, mit etwas Luft an den Rändern,
  // damit die Beschriftungen nicht abgeschnitten werden.
  const ersterPunkt = anker[0].minute;
  const letzterPunkt = anker[anker.length - 1].minute;
  const spanne = Math.max(60, letzterPunkt - ersterPunkt);
  const pct = (m: number) => 6 + ((m - ersterPunkt) / spanne) * 88;

  const jetztTeile = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const jetzt =
    Number(jetztTeile.find((t) => t.type === "hour")?.value ?? 0) * 60 +
    Number(jetztTeile.find((t) => t.type === "minute")?.value ?? 0);

  const jetztSichtbar = jetzt >= ersterPunkt && jetzt <= letzterPunkt;

  return (
    <div className="relative mb-7 h-14">
      {/* Die Linie */}
      <div className="absolute inset-x-0 top-7 h-0.5 rounded-full bg-line-strong" />

      {anker.map((p) => (
        <div key={p.id} className="absolute top-0" style={{ left: `${pct(p.minute)}%` }}>
          <span className="tabular block -translate-x-1/2 whitespace-nowrap
                           text-[10px] font-medium text-ink">
            {hhmm(p.minute)}
          </span>
          <span className="mx-auto mt-1 block h-2.5 w-2.5 -translate-x-1/2 rounded-full"
            style={{ background: FARBE[p.art], marginLeft: "-1px" }} />
          <span className="mt-1 block max-w-[5.5rem] -translate-x-1/2 truncate
                           text-center text-[10px] text-ink-muted">
            {p.titel}
          </span>
        </div>
      ))}

      {/* Wo der Tag gerade steht */}
      {jetztSichtbar && (
        <div className="absolute top-5 w-0.5 rounded bg-bad-bright"
          style={{ left: `${pct(jetzt)}%`, height: "0.75rem" }} />
      )}
    </div>
  );
}
