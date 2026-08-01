import Link from "next/link";
import { addBodyWeight } from "@/lib/actions";
import { gymConfigured, createGymClient, type BodyWeightEntry } from "@/lib/supabase/gym";
import { Button, Card, CardTitle, Input } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Schnellerfassung fürs Handy: die Handgriffe, die unterwegs anfallen,
 * in je zwei Taps. Als PWA-Shortcut direkt vom Startbildschirm erreichbar.
 */
export default async function QuickPage() {
  let letztes: BodyWeightEntry | null = null;
  if (gymConfigured()) {
    const gym = createGymClient();
    const { data } = await gym!
      .from("body_weight_entries")
      .select("entry_date, weight_kg")
      .order("entry_date", { ascending: false })
      .limit(1);
    letztes = (data?.[0] as BodyWeightEntry | undefined) ?? null;
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Schnellerfassung</h1>
        <p className="mt-1 text-sm text-ink-muted">Für unterwegs — zwei Taps, fertig.</p>
      </div>

      <Card>
        <CardTitle>Körpergewicht heute</CardTitle>
        {gymConfigured() ? (
          <form action={addBodyWeight} className="flex items-end gap-3">
            <div className="flex-1">
              <Input name="weight_kg" type="number" inputMode="decimal"
                step="0.1" min="30" max="250" required
                placeholder={letztes ? String(letztes.weight_kg) : "z.B. 92.0"} />
              {letztes && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  Zuletzt {Number(letztes.weight_kg).toFixed(1)} kg am{" "}
                  {dateLabel(letztes.entry_date)}
                </p>
              )}
            </div>
            <Button type="submit">Speichern</Button>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">
            Gym-Zugang noch nicht eingerichtet — siehe /gym.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {[
          { href: "/kalender", label: "Zeit erfassen", sub: "Tages-Check-in" },
          { href: "/transaktionen", label: "Buchung", sub: "Ausgabe festhalten" },
          { href: "/trading", label: "Trading", sub: "GVA-Board" },
          { href: "/gym", label: "Gym", sub: "Fortschritt" },
        ].map((l) => (
          <Link key={l.href} href={l.href}
            className="rounded-2xl border border-line/70 bg-card p-4 transition hover:border-line-strong">
            <div className="text-sm font-medium text-ink">{l.label}</div>
            <div className="mt-0.5 text-xs text-ink-muted">{l.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
