import Link from "next/link";
import { Card, Empty, cx } from "@/components/ui";
import { Launcher } from "@/components/launcher";
import { createClient } from "@/lib/supabase/server";
import {
  fetchEssenOverview, fetchEssenWoche, MEAL_LABEL, type EssenTag,
} from "@/lib/supabase/menu";
import { EssenWhiteboard } from "@/components/essen-whiteboard";
import { weekStart, heuteISO } from "@/lib/time";
import type { NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

/** "300 g Reis" — Menge weggelassen, wenn sie fehlt. */
function zutatText(i: { name: string; amount: number | null; unit: string | null }) {
  if (i.amount === null || Number(i.amount) === 0) return i.name;
  const m = Number(i.amount);
  const wert = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `${wert} ${i.unit ?? ""} ${i.name}`.replace(/\s+/g, " ").trim();
}

function TagSpalte({ titel, tag, mitZutaten }: {
  titel: string; tag: EssenTag | null; mitZutaten: boolean;
}) {
  const offen = tag?.meals.filter((m) => !m.eaten) ?? [];
  const offenKcal = offen.reduce((s, m) => s + Number(m.kcal_total ?? 0), 0);

  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {titel}
      </div>

      {!tag ? (
        <p className="mt-2 text-sm text-ink-muted">Nichts geplant.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {tag.meals.map((m, i) => (
              <li key={i}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-ink-muted">
                    {MEAL_LABEL[m.meal_type] ?? m.meal_type}
                  </span>
                  <span className={cx("truncate",
                    m.eaten ? "text-ink-faint line-through" : "text-ink")}>
                    {m.name}
                  </span>
                  {m.eaten && <span className="text-xs text-good">✓</span>}
                </div>

                {mitZutaten && m.items && m.items.length > 0 && (
                  <ul className="ml-[4.5rem] mt-0.5 space-y-0.5">
                    {m.items.map((it, j) => (
                      <li key={j} className={cx("text-xs",
                        it.eaten || m.eaten
                          ? "text-ink-faint line-through" : "text-ink-muted")}>
                        {zutatText(it)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <p className="tabular mt-2 text-xs text-ink-muted">
            {Math.round(tag.kcal)} kcal · {Math.round(tag.protein)} g Protein
            {offen.length > 0 && offen.length < tag.meals.length && (
              <span className="text-ink-soft">
                {" "}· noch {offen.length} offen
                {offenKcal > 0 ? ` (${Math.round(offenKcal)} kcal)` : ""}
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export default async function EssenHeutePage() {
  const supabase = await createClient();
  const [uebersicht, woche, { data: linkRows }] = await Promise.all([
    fetchEssenOverview(),
    fetchEssenWoche(weekStart(heuteISO())),
    supabase.from("links").select("*").eq("archived", false)
      .eq("group_name", "Essen").order("sort_order"),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (!uebersicht) {
    return <Empty>Menü-Datenbank nicht verbunden.</Empty>;
  }

  return (
    <>
      {/* Das Board zuerst: der Blick auf die ganze Woche ist der Grund,
          warum man diese Seite öffnet. Heute und morgen stehen darunter,
          weil sie im Board schon enthalten sind - nur ohne Zutaten. */}
      {woche && <EssenWhiteboard woche={woche} />}

      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <TagSpalte titel="Heute" tag={uebersicht.heute} mitZutaten />
          <TagSpalte titel="Morgen" tag={uebersicht.morgen} mitZutaten={false} />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line/70 pt-3 text-xs">
          <Link href="/m/Essen/einkauf"
            className={uebersicht.offeneEinkaeufe > 0 ? "text-ink-soft" : "text-ink-faint"}>
            Einkaufsliste: {uebersicht.offeneEinkaeufe === 0
              ? "nichts offen"
              : `${uebersicht.offeneEinkaeufe} offen`}
          </Link>
          <Link href="/m/Essen/plan?ansicht=woche"
            className={uebersicht.ungeplant.length > 0 ? "text-warn" : "text-ink-faint"}>
            Nächste 7 Tage: {uebersicht.ungeplant.length === 0
              ? "alles geplant"
              : `${uebersicht.ungeplant.length} ungeplant (${uebersicht.ungeplant.join(", ")})`}
          </Link>
          {uebersicht.schnitt && (
            <span className="tabular text-ink-faint">
              Ø letzte {uebersicht.schnitt.tage} Tage: {Math.round(uebersicht.schnitt.kcal)} kcal /{" "}
              {uebersicht.ziele.kcal}
            </span>
          )}
        </div>
      </Card>

      {links.length > 0 && <Launcher links={links} />}
    </>
  );
}
