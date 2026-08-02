import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { heuteISO, addDays, weekStart } from "@/lib/time";

/**
 * Erinnert daran, die Schichten der kommenden Woche einzutragen.
 *
 * Kerim bekommt den Plan eine Woche im Voraus und trägt ihn selbst ein.
 * Ohne diese Einträge lässt sich die Woche nicht planen: weder wann Zeit
 * fürs Training bleibt, noch wann gekocht werden muss.
 *
 * Die Erinnerung wird ab Freitag deutlich und ist am Sonntag dringend -
 * dann beginnt die betroffene Woche am nächsten Morgen.
 */
export async function SchichtErinnerung() {
  const supabase = await createClient();
  const heute = heuteISO();

  const naechsteWoche = addDays(weekStart(heute), 7);
  const wochenEnde = addDays(naechsteWoche, 6);

  const [{ data: arbeitsArten }, { data: geplant }] = await Promise.all([
    supabase.from("activities").select("id").eq("bucket", "arbeit"),
    supabase.from("time_entries")
      .select("entry_date, activity_id")
      .gte("entry_date", naechsteWoche)
      .lte("entry_date", wochenEnde),
  ]);

  const arbeitIds = new Set((arbeitsArten ?? []).map((a) => a.id as string));
  const arbeitstage = new Set(
    (geplant ?? [])
      .filter((e) => arbeitIds.has(e.activity_id as string))
      .map((e) => String(e.entry_date)),
  );

  // Ist die Woche schon eingetragen, ist nichts zu tun.
  if (arbeitstage.size > 0) return null;

  // Wochentag in Zürcher Zeit: 0 = Sonntag, 5 = Freitag, 6 = Samstag
  const tag = new Date(heute + "T12:00:00").getDay();
  const dringend = tag === 0 || tag === 6 || tag === 5;

  // Vor Freitag ist es zu früh - der Plan liegt oft noch nicht vor.
  if (!dringend) return null;

  const wochenLabel = new Date(naechsteWoche + "T12:00:00")
    .toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });

  return (
    <Link href="/schichten"
      className={
        "block rounded-2xl border px-5 py-3 text-sm transition " +
        (tag === 0
          ? "border-bad/40 bg-bad-tint text-ink hover:border-bad/70"
          : "border-warn/30 bg-warn-tint text-ink-soft hover:border-warn/60")
      }>
      {tag === 0
        ? `Heute ist Sonntag — die Schichten ab ${wochenLabel} fehlen noch. Ohne sie
           lässt sich die Woche nicht planen. →`
        : `Für die Woche ab ${wochenLabel} sind noch keine Schichten eingetragen.
           Spätestens Sonntag, damit wir die Woche planen können. →`}
    </Link>
  );
}
