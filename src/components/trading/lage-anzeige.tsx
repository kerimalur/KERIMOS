import { URTEIL_LABEL, URTEIL_LABEL_ALT, type LageSnapshot } from "@/lib/trading/lage-snapshot";
import { cx } from "@/components/ui";

/**
 * Die eingefrorene Fundamentallage eines Trades — dieselben drei Blöcke wie
 * im Cockpit-Popup (Ebenen, COT, Saison), nur ohne Nachladen.
 *
 * Zwei Formen laufen hier nebeneinander: Snapshots ab dem 26.09.2026 tragen
 * `fundamental` (die drei Ebenen), ältere `ranking` (den Q-Score). Der alte
 * Block wird weiter angezeigt und als alt gekennzeichnet — ein Trade vom
 * August ist unter dem Modell entstanden, das damals galt, und es wäre
 * falsch, ihn nachträglich so aussehen zu lassen, als hätte er die heutige
 * Begründung gehabt.
 */
export function LageAnzeige({ s }: { s: LageSnapshot }) {
  const neu = s.fundamental ?? null;
  const urteil = neu?.urteil ?? s.ranking?.urteil ?? "unbekannt";
  const ton = urteil === "bestaetigt" ? "text-good-bright"
    : urteil === "dagegen" ? "text-bad-bright" : "text-ink-soft";
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
          {neu
            ? URTEIL_LABEL[neu.urteil] ?? neu.urteil
            : URTEIL_LABEL_ALT[urteil] ?? urteil}
          <span className="ml-2 text-xs font-normal text-ink-muted">
            {neu ? neu.grund : s.ranking?.grund}
          </span>
        </p>
        <p className="text-xs text-ink-muted">
          {neu ? neu.satz : s.rankingSatz}
        </p>
        {!neu && (
          <p className="mt-1 text-[11px] text-ink-faint">
            Aus der Zeit des Q-Score-Rankings — dieses Modell ist seit dem
            26.09.2026 durch die drei Ebenen ersetzt.
          </p>
        )}
      </div>

      {s.urteilNeu && (
        <div className="space-y-1.5 rounded-xl bg-sand/50 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
            Urteil beim Einstieg
            {s.urteilNeu.klasse && (
              <span className="ml-2 normal-case tracking-normal text-ink-muted">
                Klasse {s.urteilNeu.klasse} — {s.urteilNeu.klasse === "A" ? "stark gegen schwach" : "stark gegen neutral, mit Vorsicht"}
              </span>
            )}
          </p>
          {[s.urteilNeu.basis, s.urteilNeu.quote].map((u) => (
            <div key={u.ccy}>
              <p className="text-xs">
                <span className="font-display font-bold text-ink">{u.ccy}</span>{" "}
                <span className={cx(u.wort.includes("bullish") ? "text-good-bright"
                  : u.wort.includes("bearish") ? "text-bad-bright" : "text-ink-soft")}>{u.wort}</span>
              </p>
              {u.gruende.map((g) => <p key={g} className="text-[11px] text-ink-muted">· {g}</p>)}
            </div>
          ))}
          <p className="text-[10px] text-ink-faint">{s.urteilNeu.gewichtung}</p>
        </div>
      )}

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
