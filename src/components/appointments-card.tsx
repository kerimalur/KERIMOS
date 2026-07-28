import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";

interface Termin {
  id: string;
  title: string;
  starts_on: string;
  start_minute: number | null;
  end_minute: number | null;
  location: string | null;
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const zeit = (t: Termin) =>
  t.start_minute === null
    ? "ganztägig"
    : t.end_minute === null
      ? hhmm(t.start_minute)
      : `${hhmm(t.start_minute)}–${hhmm(t.end_minute)}`;

/**
 * Anstehende Termine: heute zuerst, dann die nächsten zwei Wochen.
 * Fehlt die Tabelle noch, bleibt die Karte still weg.
 */
export async function AppointmentsCard() {
  const supabase = await createClient();
  const heute = heuteISO();

  const { data, error } = await supabase.from("appointments")
    .select("id, title, starts_on, start_minute, end_minute, location")
    .gte("starts_on", heute).lte("starts_on", addDays(heute, 14))
    .order("starts_on").order("start_minute", { nullsFirst: true })
    .limit(6);

  if (error) return null;

  const termine = (data ?? []) as Termin[];
  const heutige = termine.filter((t) => t.starts_on === heute);
  const spaeter = termine.filter((t) => t.starts_on > heute);

  return (
    <Card className="p-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <Link href="/termine"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted transition hover:text-ink-soft">
          Termine →
        </Link>
        {termine.length === 0 && (
          <span className="text-xs text-ink-faint">nichts geplant</span>
        )}
      </div>

      {termine.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Keine Termine in den nächsten zwei Wochen.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {heutige.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2.5 text-sm">
              <span className="tabular w-24 shrink-0 text-xs font-medium text-accent-soft">
                {zeit(t)}
              </span>
              <span className="truncate text-ink">{t.title}</span>
              {t.location && (
                <span className="shrink-0 text-xs text-ink-muted">{t.location}</span>
              )}
            </li>
          ))}

          {spaeter.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2.5 text-sm">
              <span className="w-24 shrink-0 text-xs text-ink-muted">
                {dateLabel(t.starts_on)}
              </span>
              <span className="truncate text-ink-soft">{t.title}</span>
              <span className="tabular shrink-0 text-xs text-ink-faint">{zeit(t)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
