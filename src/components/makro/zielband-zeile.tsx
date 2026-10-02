import { cx } from "@/components/ui";
import { INFLATIONSZIELE, zielLage } from "@/lib/makro/ziele";
import { tagKurz } from "./ueberraschung-teile";

/**
 * Inflation gegen das Ziel der Notenbank (02.10.2026). Kerims Regel:
 * Eine Inflationszahl allein sagt nichts — erst der Abstand zum Ziel zeigt,
 * ob die Notenbank handeln muss. Die Ziele stehen in lib/makro/ziele.ts.
 */
export function ZielbandZeile({ ccy, inflation }: {
  ccy: string;
  inflation: { wert: number; serie: string; datum: string } | null;
}) {
  const ziel = INFLATIONSZIELE[ccy];
  if (!ziel) return null;
  const lage = inflation ? zielLage(ccy, inflation.serie, inflation.wert) : null;
  const text = lage === "ueber" ? "über dem Ziel → Notenbank eher straffer"
    : lage === "unter" ? "unter dem Ziel → Notenbank eher lockerer"
      : lage === "im_band" ? "im Zielband → kein Druck zu handeln" : null;
  const farbe = lage === "ueber" ? "text-good-bright" : lage === "unter" ? "text-bad-bright" : "text-ink-soft";
  return (
    <div className="rounded-xl bg-sand/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-ink-muted">Inflationsziel</span>
        <span className="font-medium text-ink">{ziel.text}</span>
      </div>
      {inflation ? (
        <p className="mt-1 text-ink-soft">
          <span className="font-mono text-ink">{inflation.wert.toFixed(1)} %</span>
          <span className="text-ink-faint"> ({inflation.serie}, {tagKurz(inflation.datum)})</span>
          {text && <span className={cx("ml-1.5 font-medium", farbe)}>{text}</span>}
        </p>
      ) : (
        <p className="mt-1 text-ink-faint">Keine Inflations-Jahresrate im Kalender.</p>
      )}
    </div>
  );
}
