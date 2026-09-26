import { ladeKontoKette, KONTO_TYPEN, type KontoVerlauf } from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import { cx } from "@/components/ui";

const LABEL: Record<string, string> = { ek: "Eigenkapital", funded: "Funded" };

const geld = (v: number, w: string) =>
  `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("de-CH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${w}`;

/**
 * Der Kontostand über jeder Journal-Seite.
 *
 * Eine Zeile, zwei Zahlen je Konto: wo es steht und was diesen Monat daraus
 * geworden ist. Beides kommt aus der Kontokette (lib/trading/konto-verlauf.ts),
 * also aus Startkapital, Ein- und Auszahlungen und allen abgeschlossenen
 * Live-Trades — nicht aus einem Feld, das jemand nachführen müsste.
 *
 * Konten ohne Startkapital und ohne Bewegung werden weggelassen: eine Kachel
 * mit 0.00 sagt nichts und nimmt der anderen den Platz.
 */
export async function KontoLeiste() {
  if (!tradingConfigured()) return null;

  let verlauf;
  try {
    ({ verlauf } = await ladeKontoKette());
  } catch {
    return null;
  }

  const zeigen = KONTO_TYPEN
    .map((t) => verlauf.proTyp.get(t))
    .filter((v): v is KontoVerlauf => Boolean(v))
    .filter((v) => v.konto !== null || v.trades > 0);

  if (zeigen.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {zeigen.map((v) => {
        const hoch = v.veraenderungMonat > 0;
        const runter = v.veraenderungMonat < 0;
        const prozent = v.standMonatsanfang > 0
          ? (v.veraenderungMonat / v.standMonatsanfang) * 100 : null;

        return (
          <div key={v.type}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border
                       border-line/70 bg-card px-4 py-3 shadow-card">
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
              {v.konto?.name ?? LABEL[v.type]}
            </span>
            <span className="tabular font-display text-lg font-bold text-ink">
              {geld(v.stand, v.currency)}
            </span>
            <span className={cx("tabular ml-auto text-sm font-medium",
              hoch ? "text-good-bright" : runter ? "text-bad-bright" : "text-ink-muted")}>
              {hoch ? "+" : ""}{geld(v.veraenderungMonat, v.currency)}
              {prozent !== null && (
                <span className="ml-1 text-[11px] text-ink-faint">
                  ({prozent > 0 ? "+" : ""}{prozent.toFixed(1)} %)
                </span>
              )}
            </span>
            <span className="w-full text-[11px] text-ink-faint">
              diesen Monat · {v.trades} Trades gerechnet
              {v.offene > 0 && ` · ${v.offene} offen`}
              {Math.abs(v.abweichung) >= 1 && v.konto
                && ` · hinterlegt weicht um ${geld(v.abweichung, v.currency)} ab`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
