import Link from "next/link";
import { Badge, cx } from "@/components/ui";
import { einordnung } from "@/lib/makro/einordnung";
import { fmtZ, type Release } from "@/lib/makro/releases";
import type { MarktCheck } from "@/lib/makro/marktcheck";
import { zeitKurz } from "./ueberraschung-teile";

/**
 * Eine Karte je wichtigem Termin (01.10.2026): die Kette in Worten und die
 * Warnhinweise aus dem Makro-Lernen. Einordnung, keine Empfehlung — der
 * Einstieg bleibt das GVA/BOS-Setup.
 */
export function EinordnungsKarten({ termine, umfeld, leer, checks = {}, checkAktiv = false }: {
  termine: Release[];
  /** Alle Releases im Zeitraum — für die andere Seite des Paares. */
  umfeld: Release[];
  leer: string;
  /** Markt-Check je Release-id (marktcheck-laden.ts). */
  checks?: Record<string, MarktCheck>;
  /** false = kein OANDA_API_KEY, Check abgeschaltet. */
  checkAktiv?: boolean;
}) {
  if (termine.length === 0) {
    return <p className="rounded-xl bg-sand/60 px-3 py-3 text-xs text-ink-muted">{leer}</p>;
  }
  return (
    <div className="space-y-3">
      {termine.map((r) => {
        const e = einordnung(r, umfeld);
        const farbe = e.richtung === 1 ? "text-good-bright" : e.richtung === -1 ? "text-bad-bright" : "text-ink-soft";
        return (
          <div key={r.id} className="rounded-xl bg-sand/60 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-ink">
                <Link href={`/trading/waehrungen/${r.ccy}`} className="mr-2 font-display font-bold text-ink-soft hover:text-accent-soft">{r.ccy}</Link>
                {r.titel}
              </span>
              <span className="flex items-center gap-2">
                {e.stufe && <Badge tone={e.stufe === "im Rahmen" ? "neutral" : e.richtung === 1 ? "good" : "bad"}>{e.stufe}</Badge>}
                {r.z !== null && <span className={cx("font-mono text-[11px]", farbe)}>z {fmtZ(r.z)}</span>}
                <span className="tabular whitespace-nowrap font-mono text-[11px] text-trading-bright">{zeitKurz(r.event_time)}</span>
              </span>
            </div>
            {e.kette.length > 0 && (
              <ol className="mt-1.5 space-y-0.5">
                {e.kette.map((k, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-snug text-ink-soft">
                    <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.08em] text-ink-faint">{i + 1} · {k.schritt}</span>
                    <span className={k.schritt === "Kurs" ? cx("font-medium", farbe) : ""}>{k.text}</span>
                  </li>
                ))}
              </ol>
            )}
            <CheckZeile check={checks[r.id]} aktiv={checkAktiv} ccy={r.ccy} />
            {e.warnungen.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {e.warnungen.map((w) => (
                  <li key={w} className="flex gap-2 text-[11px] leading-snug text-accent-soft">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <CheckBilanz checks={Object.values(checks)} />
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Einordnung nach den Regeln aus dem Makro-Lernen, keine Empfehlung. Eine Zahl ist noch kein Bias —
        für den 3-Tages-Chart zählt die Richtung über mehrere Veröffentlichungen (Überraschungsindex).
      </p>
    </div>
  );
}

const pct = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(2)} %`);

/** Wie sich die Währung gegen alle ihre Paare bewegt hat, und ob es zur Einordnung passt. */
function CheckZeile({ check, aktiv, ccy }: { check: MarktCheck | undefined; aktiv: boolean; ccy: string }) {
  if (!aktiv) return null;
  if (!check) return <p className="mt-1.5 text-[11px] text-ink-faint">Markt-Check: noch keine Kerzen (zu frisch oder ausserhalb der letzten 8 Termine).</p>;
  const farbe = check.urteil === "bestätigt" ? "text-good-bright" : check.urteil === "widerspricht" ? "text-bad-bright" : "text-ink-soft";
  const h1 = check.fenster.find((f) => f.key === "1h");
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
      <span className="uppercase tracking-[0.08em] text-ink-faint">Markt-Check {ccy} gegen alle</span>
      {check.fenster.map((f) => (
        <span key={f.key} className="font-mono">{f.key} <span className={f.mittel === null ? "" : f.mittel > 0 ? "text-good-bright" : "text-bad-bright"}>{pct(f.mittel)}</span></span>
      ))}
      <span className={cx("font-semibold", farbe)}>
        {check.urteil}{h1 && h1.paare > 0 && (check.urteil === "bestätigt" || check.urteil === "widerspricht" || check.urteil === "unklar") ? ` (${h1.mitRichtung}/${h1.paare} Paare in erwarteter Richtung, 1 h)` : ""}
      </span>
    </p>
  );
}

function CheckBilanz({ checks }: { checks: MarktCheck[] }) {
  const gewertet = checks.filter((c) => c.urteil === "bestätigt" || c.urteil === "widerspricht" || c.urteil === "unklar");
  if (gewertet.length === 0) return null;
  const b = gewertet.filter((c) => c.urteil === "bestätigt").length;
  const w = gewertet.filter((c) => c.urteil === "widerspricht").length;
  return (
    <p className="text-[11px] text-ink-muted">
      Markt-Check der Auswahl: <span className="text-good-bright">{b} bestätigt</span> · <span className="text-bad-bright">{w} widerspricht</span> · {gewertet.length - b - w} unklar.
      Wenige Fälle sind noch keine Statistik — erst über Wochen zeigt sich, welche Zahlen den Markt wirklich bewegen.
    </p>
  );
}
