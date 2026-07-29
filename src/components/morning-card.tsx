import { createClient } from "@/lib/supabase/server";
import { logSleep } from "@/lib/actions";
import { Button, Card } from "@/components/ui";
import { heuteISO, heuteMinuten, addDays, ZONE, fmtMinutes } from "@/lib/time";
import { chf } from "@/lib/format";
import { naechsterMeilenstein } from "@/lib/meilensteine";

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function gruss(minute: number): string {
  if (minute < 5 * 60) return "Gute Nacht";
  if (minute < 11 * 60) return "Guten Morgen";
  if (minute < 17 * 60) return "Guten Tag";
  return "Guten Abend";
}

/**
 * Der Einstieg in den Tag: Begrüssung, Schlafvorschlag aus dem letzten
 * Eintrag, Erfassungs-Streak, Countdown und der Geldrhythmus des Monats.
 *
 * Der Schlafvorschlag ist der Kern: Ende des letzten gestrigen Eintrags bis
 * jetzt. Ein Tap trägt ihn ein und schliesst damit genau die Lücke, die das
 * Zeitmodul sonst als unerfasst ausweist.
 */
export async function MorningCard() {
  const supabase = await createClient();
  const heute = heuteISO();
  const gestern = addDays(heute, -1);
  const jetzt = heuteMinuten();

  const [{ data: gestrige }, { data: heutige }, { data: streakTage },
         { data: fixkosten }, { data: letzterLohn }] = await Promise.all([
    supabase.from("time_entries")
      .select("start_minute, minutes, activity_id")
      .eq("entry_date", gestern).order("start_minute"),
    supabase.from("time_entries").select("id").eq("entry_date", heute).limit(1),
    // Für die Serie genügen die Tage mit mindestens einem Eintrag
    supabase.from("time_entries").select("entry_date")
      .gte("entry_date", addDays(heute, -120)).order("entry_date", { ascending: false }),
    supabase.from("recurring_items")
      .select("label, amount, day_of_month, interval, active")
      .eq("active", true).lt("amount", 0),
    supabase.from("transactions").select("occurred_on, amount")
      .gt("amount", 0).eq("is_transfer", false)
      .order("occurred_on", { ascending: false }).limit(1),
  ]);

  /* ---- Schlafvorschlag ---- */
  const letzterGestern = (gestrige ?? [])
    .map((e) => ({
      ende: (Number(e.start_minute ?? 0) + Number(e.minutes)),
      hatZeit: e.start_minute !== null,
    }))
    .filter((e) => e.hatZeit)
    .sort((a, b) => b.ende - a.ende)[0];

  const schonHeuteErfasst = (heutige ?? []).length > 0;
  const schlafVon = letzterGestern ? Math.min(letzterGestern.ende, 1439) : null;
  // Nur morgens anbieten, und nur wenn der Abend überhaupt erfasst wurde
  const zeigeSchlaf = !schonHeuteErfasst && schlafVon !== null
    && jetzt < 12 * 60 && schlafVon >= 18 * 60;
  const schlafDauer = zeigeSchlaf ? (1440 - schlafVon!) + jetzt : 0;

  /* ---- Streak: Tage in Folge mit erfasster Zeit ---- */
  const tage = new Set((streakTage ?? []).map((r) => String(r.entry_date)));
  let streak = 0;
  let cursor = tage.has(heute) ? heute : gestern;
  while (tage.has(cursor)) { streak++; cursor = addDays(cursor, -1); }

  /* ---- Geldrhythmus ---- */
  const monatlich = (fixkosten ?? []).filter((f) => f.interval === "monthly");
  const tagHeute = Number(heute.slice(8, 10));
  const naechste = monatlich
    .map((f) => ({
      label: String(f.label),
      betrag: Math.abs(Number(f.amount)),
      tag: Number(f.day_of_month ?? 1),
    }))
    .filter((f) => f.tag >= tagHeute)
    .sort((a, b) => a.tag - b.tag)[0]
    ?? monatlich
      .map((f) => ({
        label: String(f.label),
        betrag: Math.abs(Number(f.amount)),
        tag: Number(f.day_of_month ?? 1),
      }))
      .sort((a, b) => a.tag - b.tag)[0];

  const lohn = letzterLohn?.[0] as { occurred_on: string; amount: number } | undefined;

  /* ---- Countdown ---- */
  const ziel = naechsterMeilenstein(heute);

  const datum = new Date().toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", timeZone: ZONE,
  });

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-2xl font-medium leading-tight text-ink">
            {gruss(jetzt)}, Kerim
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {datum} · {hhmm(jetzt)}
          </p>
        </div>
        {streak > 1 && (
          <span className="rounded-lg bg-sand px-2.5 py-1 text-xs text-ink-soft">
            {streak} Tage in Folge erfasst
          </span>
        )}
      </div>

      {zeigeSchlaf && (
        <form action={logSleep}
          className="mt-4 rounded-xl border border-accent bg-accent-tint p-3">
          <input type="hidden" name="von" value={hhmm(schlafVon!)} />
          <input type="hidden" name="bis" value={hhmm(jetzt)} />
          <p className="text-xs text-accent-soft">Geschlafen seit dem letzten Eintrag</p>
          <p className="tabular mt-1 text-lg font-medium text-ink">
            {hhmm(schlafVon!)} – {hhmm(jetzt)}
            <span className="ml-2 text-sm font-normal text-ink-soft">
              {fmtMinutes(schlafDauer)}
            </span>
          </p>
          <Button type="submit" className="mt-2.5 w-full">
            Stimmt, als Schlaf eintragen
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-xs">
        {ziel && (
          <span className="text-ink-soft">
            <span className="tabular font-medium text-ink">{ziel.tage} Tage</span>
            {" "}bis {ziel.label}
          </span>
        )}
        {naechste && (
          <span className="text-ink-soft">
            <span className="tabular font-medium text-ink">{chf(naechste.betrag)}</span>
            {" "}am {naechste.tag}. · {naechste.label}
          </span>
        )}
        {lohn && (
          <span className="text-ink-muted">
            Zuletzt {chf(Number(lohn.amount))} am{" "}
            {new Date(lohn.occurred_on + "T12:00:00").toLocaleDateString("de-CH", {
              day: "numeric", month: "numeric",
            })}
          </span>
        )}
      </div>
    </Card>
  );
}
