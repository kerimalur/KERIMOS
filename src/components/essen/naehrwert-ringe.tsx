import { Card, cx } from "@/components/ui";
import {
  anteil, darueber, uebrig, lage,
  type Naehrziel, type NaehrKey, type Lage,
} from "@/lib/naehrwerte";

/**
 * Die Ringe oben auf der Essen-Seite.
 *
 * Der Ring füllt sich mit dem, was **gegessen** ist — nicht mit dem, was
 * geplant ist. Das ist der ganze Unterschied zum alten Wochen-Board: geplant
 * war dort alles, gegessen sagte es nicht. Was geplant ist, steht als Zeile
 * darunter.
 *
 * **Zur Farbe:** die drei Zustände benutzen die Statusfarben des Hauses
 * (Bernstein → Grün → Rot). Bernstein und Rot liegen bei Rot-Grün-Schwäche
 * dicht beieinander (ΔE 7.1, gemessen, nicht geschätzt). Deshalb steht neben
 * jedem Ring der Zustand **als Wort und als Zahl** — die Farbe ist die
 * Zugabe, nie der einzige Träger. Ein Ring, den man nur an der Farbe lesen
 * kann, ist für einen Teil der Leute leer.
 *
 * Über dem Ziel läuft der Ring nicht weiter. Ein zweites Mal herum sähe bei
 * 4200 kcal aus wie bei 2100.
 */

const FARBE: Record<Lage, { bahn: string; strich: string; text: string }> = {
  offen: { bahn: "#3A2A20", strich: "#E7A96B", text: "text-ink" },
  gut: { bahn: "#1C2B23", strich: "#5FC2A6", text: "text-good-bright" },
  drueber: { bahn: "#2E1C1A", strich: "#E28B72", text: "text-bad-bright" },
};

const zahl = (n: number) => Math.round(n).toLocaleString("de-CH");

function Ring({ groesse, staerke, fuellung, lage: l, children }: {
  groesse: number;
  staerke: number;
  fuellung: number;
  lage: Lage;
  children: React.ReactNode;
}) {
  const r = (groesse - staerke) / 2;
  const umfang = 2 * Math.PI * r;
  const farbe = FARBE[l];

  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`}
        aria-hidden className="-rotate-90">
        {/* Die Bahn ist eine hellere Stufe derselben Farbe, kein neutrales
            Grau: so liest sich der Zustand über den ganzen Ring und nicht nur
            über das gefüllte Stück. */}
        <circle cx={groesse / 2} cy={groesse / 2} r={r}
          fill="none" stroke={farbe.bahn} strokeWidth={staerke} />
        <circle cx={groesse / 2} cy={groesse / 2} r={r}
          fill="none" stroke={farbe.strich} strokeWidth={staerke} strokeLinecap="round"
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - fuellung)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
}

/** Ein Satz statt einer Farbe: „noch 860" · „erreicht" · „260 drüber". */
function standText(key: NaehrKey, wert: number, ziel: number, einheit: string): string {
  const drueber = darueber(wert, ziel);
  if (drueber > 0) {
    return key === "protein"
      ? `${zahl(drueber)} ${einheit} extra`
      : `${zahl(drueber)} ${einheit} drüber`;
  }
  const rest = uebrig(wert, ziel);
  return rest === 0 ? "erreicht" : `noch ${zahl(rest)} ${einheit}`;
}

export function NaehrwertRinge({ ziele, gegessen, geplant }: {
  ziele: Naehrziel[];
  gegessen: Record<NaehrKey, number>;
  geplant: Record<NaehrKey, number>;
}) {
  const kcal = ziele.find((z) => z.key === "kcal");
  const rest = ziele.filter((z) => z.key !== "kcal");
  if (!kcal) return null;

  const kcalLage = lage("kcal", gegessen.kcal, kcal.ziel);

  return (
    <Card area="essen">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-5">
        {/* Die eine grosse Zahl der Seite. Proportionale Ziffern, nicht
            tabellarisch: bei dieser Grösse sähe „1 240" sonst locker aus. */}
        <div className="flex items-center gap-4">
          <Ring groesse={124} staerke={9}
            fuellung={anteil(gegessen.kcal, kcal.ziel)} lage={kcalLage}>
            <div>
              <div className={cx("font-display text-3xl font-bold", FARBE[kcalLage].text)}>
                {zahl(gegessen.kcal)}
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">kcal</div>
            </div>
          </Ring>

          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">
              {standText("kcal", gegessen.kcal, kcal.ziel, "kcal")}
            </div>
            <div className="tabular mt-0.5 text-xs text-ink-muted">
              Ziel {zahl(kcal.ziel)} kcal
            </div>
            <div className="tabular text-xs text-ink-faint">
              geplant {zahl(geplant.kcal)} kcal
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          {rest.map((z) => {
            const wert = gegessen[z.key];
            const l = lage(z.key, wert, z.ziel);
            return (
              <div key={z.key} className="w-[76px] text-center">
                <Ring groesse={64} staerke={6} fuellung={anteil(wert, z.ziel)} lage={l}>
                  <div className={cx("text-sm font-semibold", FARBE[l].text)}>
                    {zahl(wert)}
                  </div>
                </Ring>
                <div className="mt-1.5 text-[11px] font-medium text-ink-soft">{z.label}</div>
                <div className="tabular text-[10px] text-ink-faint">
                  von {zahl(z.ziel)} {z.einheit}
                </div>
                <div className="text-[10px] text-ink-muted">
                  {standText(z.key, wert, z.ziel, z.einheit)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {ziele.length === 2 && (
        <p className="mt-4 border-t border-line/60 pt-3 text-[11px] text-ink-faint">
          Kohlenhydrate und Fett bekommen einen eigenen Ring, sobald in den{" "}
          <a href="/m/Essen/einstellungen" className="text-accent-soft hover:underline">
            Einstellungen
          </a>{" "}
          ein Ziel dafür steht. Ohne Ziel wäre der Ring nur eine Zahl ohne Massstab.
        </p>
      )}
    </Card>
  );
}
