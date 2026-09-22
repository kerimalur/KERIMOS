import { URTEIL_LABEL, type LageSnapshot } from "@/lib/trading/lage-snapshot";
import { cx } from "@/components/ui";

/**
 * Die eingefrorene Fundamentallage eines Trades — dieselben drei Blöcke wie
 * im Cockpit-Popup (Ranking, COT, Saison), nur ohne Nachladen.
 */
export function LageAnzeige({ s }: { s: LageSnapshot }) {
  const ton = s.ranking.urteil === "bestaetigt" ? "text-good-bright"
    : s.ranking.urteil === "dagegen" ? "text-bad-bright" : "text-ink-soft";
  const tag = `${s.stichtag.slice(8, 10)}.${s.stichtag.slice(5, 7)}.${s.stichtag.slice(0, 4)}`;

  return (
    <div className="space-y-2.5 text-sm">
      <p className="text-[11px] text-ink-faint">
        Stand {tag} ·{" "}
        {s.quelle === "auto"
          ? "automatisch kurz nach dem Einstieg festgehalten"
          : "von Hand nachgetragen — zeigt die Lage vom Tag des Nachtragens, nicht vom Einstieg"}
      </p>
      <div>
        <p className={cx("font-medium", ton)}>
          {URTEIL_LABEL[s.ranking.urteil] ?? s.ranking.urteil}
          {s.ranking.grund && (
            <span className="ml-2 text-xs font-normal text-ink-muted">{s.ranking.grund}</span>
          )}
        </p>
        {s.rankingSatz && <p className="text-xs text-ink-muted">{s.rankingSatz}</p>}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">COT</p>
        <p className="text-xs text-ink-soft">{s.cotFehler ?? s.cotSatz}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Saison</p>
        <p className="text-xs text-ink-soft">{s.saisonFehler ?? s.saisonSatz}</p>
      </div>
    </div>
  );
}
