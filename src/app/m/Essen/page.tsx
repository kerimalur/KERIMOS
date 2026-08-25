import Link from "next/link";
import { Card, Empty } from "@/components/ui";
import { PlanDay } from "@/components/plan-day";
import { NaehrwertRinge } from "@/components/essen/naehrwert-ringe";
import { BonusKarte } from "@/components/essen/bonus-karte";
import { ladeBudget } from "@/lib/supabase/essen-bonus-db";
import { zieleAus } from "@/lib/naehrwerte";
import {
  fetchDayView, fetchFoods, fetchRecipes, fetchDayTemplates,
  fetchPrepStock, fetchPrepStand, fetchMenuSettings, menuConfigured,
} from "@/lib/supabase/menu";
import { heuteISO, addDays } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Der Tag im Essen-Bereich — das Tagebuch.
 *
 * **Umgebaut am 24.08.2026.** Vorher stand hier das weisse Wochen-Board, und
 * ganz unten die Kachelleiste mit Suchfeld. Beides ist raus, und zwar aus dem
 * einfachsten Grund, den Kerim selbst genannt hat: er landet beim Öffnen
 * jedes Mal unten bei einer Suche, die ihn dorthin bringen soll, wo er schon
 * ist. Die Wochenansicht gibt es unter `Plan → Woche`, die Verwaltung unter
 * `Mehr`.
 *
 * Was stattdessen hier steht: die Ringe (gegessen gegen Ziel), dann der Tag
 * selbst mit seinen Mahlzeiten-Slots zum Abhaken und Ergänzen. Über die
 * Pfeile oben ist derselbe Bildschirm auch für morgen zuständig — deshalb
 * braucht `Plan → Tag` nicht mehr zu existieren und leitet hierher um.
 *
 * Die Kalorienzahl im Ring kommt aus `ladeBudget`, also inklusive
 * Aktivitätsbonus. Sie MUSS aus derselben Quelle kommen wie die Bonus-Karte
 * darunter — zwei Stellen, die das Tagesziel bestimmen, hiessen schon einmal
 * zwei verschiedene Zahlen auf einem Bildschirm.
 */
export default async function EssenHeutePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  if (!menuConfigured()) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const sp = await searchParams;
  const heute = heuteISO();
  const datum = ISO.test(sp.d ?? "") ? sp.d! : heute;

  const [tag, foods, rezepte, vorlagen, prepBestand, prepStand, settings, bonus] =
    await Promise.all([
      fetchDayView(datum), fetchFoods(), fetchRecipes(), fetchDayTemplates(),
      fetchPrepStock(), fetchPrepStand(), fetchMenuSettings(), ladeBudget(datum),
    ]);

  if (!tag) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const ziele = zieleAus(settings, bonus.budget.gesamt);
  const wochentag = new Date(datum + "T12:00:00")
    .toLocaleDateString("de-CH", { weekday: "long" });

  return (
    <>
      {/* Datum oben, nicht unten: was man liest, gilt für einen Tag, und
          welcher das ist, muss vor allem anderen dastehen. */}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/m/Essen?d=${addDays(datum, -1)}`}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
          ←
        </Link>
        <div className="text-center">
          <div className="font-medium text-ink">
            {datum === heute ? "Heute" : wochentag}
          </div>
          <div className="text-xs text-ink-muted">{dateLabel(datum)}</div>
        </div>
        <Link href={`/m/Essen?d=${addDays(datum, 1)}`}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
          →
        </Link>
      </div>

      <NaehrwertRinge ziele={ziele}
        gegessen={{
          kcal: tag.gegessenKcal, protein: tag.gegessenProtein,
          kh: tag.gegessenKh, fett: tag.gegessenFett,
        }}
        geplant={{ kcal: tag.kcal, protein: tag.protein, kh: tag.kh, fett: tag.fett }} />

      {/* Wie viel darf ich heute essen? Nach einem langen Lauf ist die
          Antwort eine andere als sonst. */}
      <BonusKarte datum={datum} />

      <PlanDay tag={tag} foods={foods} vorlagen={vorlagen} prepBestand={prepBestand}
        budget={bonus.budget}
        rezepte={rezepte.map((r) => ({
          id: r.id, name: r.name, meal_type: r.meal_type,
          items: r.items.map((i) => ({
            food_id: i.food_id, food_name: i.food_name,
            amount_per_portion: i.amount_per_portion, unit: i.unit,
          })),
        }))} />

      {/* Der Kühlschrank-Stand stand bis zum 24.08. im Prep-Tab. Der Tab ist
          weg — Tage kopieren erledigt das Planen, und die Rezeptideen stehen
          unter Rezepte. Diese eine Zeile war das Nützliche daran und bleibt. */}
      <Card flat>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {prepStand && (
            <span className="text-ink-soft">
              {prepStand.tage === null
                ? "Keine Boxen einem Tag zugeordnet."
                : prepStand.tage === 0
                  ? "Die letzte Box ist für heute."
                  : `Boxen reichen noch ${prepStand.tage} ${prepStand.tage === 1 ? "Tag" : "Tage"}`}
            </span>
          )}
          <Link href="/m/Essen/einkauf"
            className={prepStand && prepStand.offeneEinkaeufe > 0 ? "text-ink-soft" : "text-ink-faint"}>
            Einkaufsliste: {!prepStand || prepStand.offeneEinkaeufe === 0
              ? "nichts offen" : `${prepStand.offeneEinkaeufe} offen`}
          </Link>
          <Link href="/m/Essen/plan?ansicht=woche"
            className={prepStand && prepStand.ungeplant > 0 ? "text-warn" : "text-ink-faint"}>
            Nächste 7 Tage: {!prepStand || prepStand.ungeplant === 0
              ? "alles geplant" : `${prepStand.ungeplant} ungeplant`}
          </Link>
          <Link href="/m/Essen/kochen" className="text-ink-faint hover:text-ink-muted">
            Kochliste →
          </Link>
        </div>
      </Card>
    </>
  );
}
