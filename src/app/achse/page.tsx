import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Tagesachse, type AchsenBlock, type AchsenMarke } from "@/components/tagesachse";
import { heuteISO, ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Entwurf: der Tag als durchgehende senkrechte Achse statt als Kartenstapel.
 *
 * Der Gedanke dahinter: Ein Kartenstapel zeigt Dinge nebeneinander, die in
 * Wirklichkeit nacheinander passieren. Auf einer Zeitachse sieht man sofort,
 * wo der Tag voll ist und wo Löcher sind - und die Löcher sind genau die
 * Stunden, die in der Wochenauswertung als "unerfasst" auftauchen.
 *
 * Bewusst eine eigene Route: /heute bleibt unverändert, bis entschieden ist,
 * ob das hier besser ist.
 */
export default async function AchsenEntwurf() {
  const supabase = await createClient();
  const heute = heuteISO();

  const [{ data: entries }, { data: activities }, { data: termine }] = await Promise.all([
    supabase.from("time_entries")
      .select("id, activity_id, minutes, start_minute")
      .eq("entry_date", heute),
    supabase.from("activities").select("id, name, color, bucket, is_sleep"),
    supabase.from("appointments")
      .select("id, title, start_minute, end_minute, location")
      .eq("starts_on", heute),
  ]);

  const akt = new Map(
    (activities ?? []).map((a) => [
      a.id as string,
      {
        name: a.name as string,
        color: (a.color as string | null) ?? "#9A8C74",
        bucket: (a.bucket as string | null) ?? "",
        schlaf: Boolean(a.is_sleep),
      },
    ]),
  );

  // Nur Einträge mit Startzeit können auf die Achse. Einträge ohne
  // Startzeit sind erfasst, aber nicht verortet - die zählen unten separat,
  // sonst würde die Achse Lücken zeigen, die keine sind.
  const bloecke: AchsenBlock[] = [];
  let ohneZeit = 0;

  for (const e of entries ?? []) {
    const start = e.start_minute as number | null;
    const dauer = Number(e.minutes ?? 0);
    const a = akt.get(e.activity_id as string);

    if (start === null || dauer <= 0) {
      ohneZeit += dauer;
      continue;
    }
    bloecke.push({
      id: e.id as string,
      von: start,
      bis: start + dauer,
      titel: a?.name ?? "Aktivität",
      farbe: a?.color ?? "#9A8C74",
      schlaf: a?.schlaf ?? false,
    });
  }

  const marken: AchsenMarke[] = (termine ?? [])
    .filter((t) => t.start_minute !== null)
    .map((t) => ({
      id: t.id as string,
      minute: Number(t.start_minute),
      titel: t.title as string,
      zusatz: (t.location as string | null) ?? null,
    }));

  const datum = new Date().toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", timeZone: ZONE,
  });

  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <div>
        <Link href="/heute" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Heute (aktuelle Ansicht)
        </Link>
        <h1 className="font-display mt-1 text-xl font-bold text-ink">Dein Tag</h1>
        <p className="text-xs text-ink-muted">{datum} · Entwurf</p>
      </div>

      <Tagesachse bloecke={bloecke} marken={marken} ohneZeit={ohneZeit} />
    </div>
  );
}
