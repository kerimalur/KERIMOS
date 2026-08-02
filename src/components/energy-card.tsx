import Link from "next/link";
import { Card } from "@/components/ui";
import { fetchEssenOverview } from "@/lib/supabase/menu";
import { fetchGarminEnergie } from "@/lib/supabase/garmin";

/**
 * Energie heute: was geplant ist, was die Uhr an Verbrauch meldet, und was
 * daraus als Bilanz folgt.
 *
 * Bewusste Entscheidung zur Bilanz: gerechnet wird gegen den Ø-Verbrauch der
 * abgeschlossenen Tage, nicht gegen den heutigen Zwischenstand. Um 8 Uhr
 * morgens hat die Uhr erst ein paar hundert Kalorien gezählt - eine Bilanz
 * daraus würde jeden Morgen ein dramatisches Defizit anzeigen, das nichts
 * bedeutet. Der heutige Stand steht daneben, aber klar als Zwischenstand.
 */
export async function EnergyCard() {
  const [essen, energie] = await Promise.all([
    fetchEssenOverview(),
    fetchGarminEnergie(),
  ]);

  // Ohne Uhrendaten hat die Karte keinen Mehrwert gegenüber dem Essen-Bereich.
  if (!energie.schnittVerbrauch && !energie.heute) return null;

  const zufuhr = essen?.heute?.kcal ?? 0;
  const protein = essen?.heute?.protein ?? 0;
  const ziele = essen?.ziele ?? { kcal: 2100, protein: 190 };

  const referenz = energie.schnittVerbrauch;
  const bilanz = referenz && zufuhr > 0 ? zufuhr - referenz : null;

  const schritte = energie.heute?.schritte ?? null;
  const heuteVerbrauch = energie.heute?.kalorien_gesamt ?? null;
  const nummer = (v: number) => v.toLocaleString("de-CH");

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Energie heute
        </span>
        {schritte !== null && (
          <span className="text-xs tabular-nums text-ink-muted">
            {nummer(schritte)} Schritte
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[11px] text-ink-muted">Geplant</div>
          <div className="font-display text-lg font-bold tabular-nums text-ink">
            {zufuhr > 0 ? nummer(zufuhr) : "—"}
          </div>
          <div className="text-[11px] text-ink-muted">
            von {nummer(ziele.kcal)} kcal
          </div>
        </div>

        <div>
          <div className="text-[11px] text-ink-muted">Verbrauch Ø</div>
          <div className="font-display text-lg font-bold tabular-nums text-ink">
            {referenz ? nummer(referenz) : "—"}
          </div>
          <div className="text-[11px] text-ink-muted">
            {energie.tage > 0 ? `${energie.tage} Tage` : "keine Daten"}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-ink-muted">Bilanz</div>
          <div
            className={
              "font-display text-lg font-bold tabular-nums " +
              (bilanz === null ? "text-ink"
                : bilanz < 0 ? "text-good-bright" : "text-accent")
            }
          >
            {bilanz === null ? "—" : `${bilanz > 0 ? "+" : ""}${nummer(bilanz)}`}
          </div>
          <div className="text-[11px] text-ink-muted">
            {bilanz === null ? "—" : bilanz < 0 ? "Defizit" : "Überschuss"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="tabular-nums">
          Protein {protein > 0 ? `${Math.round(protein)} / ${ziele.protein} g` : "—"}
        </span>
        {heuteVerbrauch !== null && (
          <span className="tabular-nums">
            heute bisher {nummer(heuteVerbrauch)} kcal verbraucht
          </span>
        )}
        <Link href="/m/Essen" className="ml-auto transition hover:text-ink">
          Essen →
        </Link>
      </div>
    </Card>
  );
}
