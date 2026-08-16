import { Badge, Bar, cx } from "@/components/ui";
import { FRISCHE_LABEL, type Frische } from "@/lib/confluence/reihen";
import {
  URTEIL_LABEL, FAKTOR_ROLLE,
  type FaktorUrteil, type PaarUrteil, type RegimeLage,
  type VetoUrteil, type Urteilswort, type WaehrungsBild,
} from "@/lib/confluence/faktoren";

/**
 * Anzeigebausteine der Confluence-Seite.
 *
 * Alles Server-Komponenten: die Seite ist eine Auswertung, kein Werkzeug —
 * es gibt nichts zu klicken ausser dem Formular oben, und das ist ein
 * gewöhnliches GET-Formular. Kein Kilobyte JavaScript für eine Tabelle.
 */

export const TON: Record<Urteilswort, "good" | "warn" | "bad" | "neutral"> = {
  rueckenwind: "good",
  "leichter-rueckenwind": "good",
  gemischt: "warn",
  gegenwind: "bad",
  neutral: "neutral",
  zuwenig: "neutral",
};

/** Richtungspfeil — konsequent grün/rot, überall gleich. */
export function Pfeil({ dir, gross }: { dir: -1 | 0 | 1; gross?: boolean }) {
  return (
    <span className={cx(
      "font-medium tabular-nums",
      gross ? "text-lg" : "text-sm",
      dir > 0 ? "text-good-bright" : dir < 0 ? "text-bad-bright" : "text-ink-faint",
    )}>
      {dir > 0 ? "▲" : dir < 0 ? "▼" : "–"}
    </span>
  );
}

/**
 * Wie aktuell die Quelle ist.
 *
 * Steht überall dabei, wo eine Zahl steht. Eine veraltete Zahl sieht sonst
 * genauso aus wie eine frische — und ein Realzins von vor vier Monaten ist
 * keine Confluence, sondern eine Erinnerung.
 */
export function FrischeChip({ frische }: { frische: Frische }) {
  const ton = frische === "frisch" ? "good"
    : frische === "brauchbar" ? "neutral"
      : frische === "alt" ? "warn" : "bad";
  return <Badge tone={ton}>{FRISCHE_LABEL[frische]}</Badge>;
}

export function FaktorZeile({ f }: { f: FaktorUrteil }) {
  return (
    <li className={cx(
      "rounded-xl border-l-2 bg-sand/40 py-2.5 pl-3 pr-3",
      f.dir > 0 ? "border-good/50" : f.dir < 0 ? "border-bad/50" : "border-line",
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <Pfeil dir={f.dir} />
        <span className="text-sm font-medium text-ink">{f.label}</span>
        {f.dir !== 0 && (
          <span className="w-16">
            <Bar pct={f.staerke * 100}
              color={f.dir > 0 ? "var(--good, #6BBF8A)" : "var(--bad, #D97070)"} />
          </span>
        )}
        <span className="ml-auto"><FrischeChip frische={f.frische} /></span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{f.text}</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">{FAKTOR_ROLLE[f.key]}</p>
    </li>
  );
}

export function VetoZeile({ v, gefragt }: { v: VetoUrteil; gefragt: -1 | 0 | 1 }) {
  const aktiv = gefragt !== 0 && v.gegen === gefragt;
  return (
    <li className={cx(
      "rounded-xl border-l-2 py-2.5 pl-3 pr-3",
      aktiv ? "border-bad/60 bg-bad-tint" : "border-line bg-sand/40",
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("text-sm", aktiv ? "text-bad-bright" : "text-ink-faint")}>
          {aktiv ? "⛔" : "○"}
        </span>
        <span className="text-sm font-medium text-ink">COT-Perzentil</span>
        {aktiv && <Badge tone="bad">Veto</Badge>}
        <span className="ml-auto"><FrischeChip frische={v.frische} /></span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{v.text}</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">{FAKTOR_ROLLE.cot}</p>
    </li>
  );
}

export function RegimeKarte({ regime }: { regime: RegimeLage }) {
  const ton = regime.lage === "risk-on" ? "good"
    : regime.lage === "risk-off" ? "bad"
      : regime.lage === "neutral" ? "neutral" : "warn";

  return (
    <div className="rounded-xl bg-sand/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Risiko-Regime</span>
        <Badge tone={ton}>
          {regime.lage === "risk-on" ? "Risk-on"
            : regime.lage === "risk-off" ? "Risk-off"
              : regime.lage === "neutral" ? "neutral" : "unbekannt"}
        </Badge>
        {regime.score !== null && (
          <span className="num text-xs text-ink-muted">{regime.score.toFixed(2)}</span>
        )}
        <span className="ml-auto"><FrischeChip frische={regime.frische} /></span>
      </div>

      {regime.teile.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {regime.teile.map((t) => (
            <li key={t.label} className="flex items-baseline gap-2 text-xs text-ink-muted">
              <Pfeil dir={t.score > 0.2 ? 1 : t.score < -0.2 ? -1 : 0} />
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-faint">
          Keine der drei Quellen antwortet — dieser Faktor fällt aus.
        </p>
      )}

      {regime.fehlend.length > 0 && regime.teile.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Nicht dabei: {regime.fehlend.join(", ")}. Das Regime beruht auf{" "}
          {regime.teile.length} von 3 Quellen.
        </p>
      )}
    </div>
  );
}

/** Das grosse Urteil oben auf dem Rückblick. */
export function UrteilKarte({ u }: { u: PaarUrteil }) {
  const ton = TON[u.urteil];
  return (
    <div className={cx(
      "rounded-xl border p-4",
      ton === "good" ? "border-good/30 bg-good-tint"
        : ton === "bad" ? "border-bad/30 bg-bad-tint"
          : ton === "warn" ? "border-accent/30 bg-warn-tint"
            : "border-line bg-sand/50",
    )}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-display text-lg font-bold text-ink">{u.paar}</span>
        {u.gefragt !== 0 && (
          <Badge tone={u.gefragt > 0 ? "good" : "bad"}>
            {u.gefragt > 0 ? "LONG" : "SHORT"}
          </Badge>
        )}
        <Badge tone={ton}>{URTEIL_LABEL[u.urteil]}</Badge>
        {u.vetoAktiv && <Badge tone="bad">COT-Veto</Badge>}
        <span className="ml-auto num text-xs text-ink-muted">
          Stand {u.stichtag}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{u.satz}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span className="num">{u.dafuer} dafür</span>
        <span className="num">{u.dagegen} dagegen</span>
        <span className="num">{u.stumm} stumm</span>
        {u.einigkeit !== null && (
          <span className="num">Einigkeit {(u.einigkeit * 100).toFixed(0)} %</span>
        )}
        <FrischeChip frische={u.frische} />
      </div>
    </div>
  );
}

/** Die 28 Paare als Liste — sortiert nach Deutlichkeit, nicht alphabetisch. */
export function PaarTabelle({ paare }: { paare: PaarUrteil[] }) {
  const sortiert = [...paare].sort((a, b) => Math.abs(b.netto) - Math.abs(a.netto));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Paar</th>
            <th className="px-2 py-2 text-center font-normal">Zins</th>
            <th className="px-2 py-2 text-center font-normal">Real</th>
            <th className="px-2 py-2 text-center font-normal">Regime</th>
            <th className="px-2 py-2 text-center font-normal">Veto</th>
            <th className="px-2 py-2 text-right font-normal">Netto</th>
            <th className="px-2 py-2 text-left font-normal">Lage</th>
          </tr>
        </thead>
        <tbody>
          {sortiert.map((u) => (
            <tr key={u.paar} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
              <td className="px-2 py-2">
                <a href={`/trading/confluence?ansicht=rueckblick&paar=${u.paar}`}
                  className="font-medium text-ink hover:text-accent-soft hover:underline">
                  {u.basis}/{u.quote}
                </a>
              </td>
              {u.faktoren.map((f) => (
                <td key={f.key} className="px-2 py-2 text-center" title={f.text}>
                  <Pfeil dir={f.dir} />
                </td>
              ))}
              <td className="px-2 py-2 text-center" title={u.veto.text}>
                {u.veto.gegen === 0
                  ? <span className="text-ink-faint">–</span>
                  : <span className="text-[11px] text-accent">
                    {u.veto.gegen > 0 ? "gg. Long" : "gg. Short"}
                  </span>}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                u.netto > 0.05 ? "text-good-bright" : u.netto < -0.05 ? "text-bad-bright" : "text-ink-faint")}>
                {u.netto > 0 ? "+" : ""}{u.netto.toFixed(2)}
              </td>
              <td className="px-2 py-2">
                <Badge tone={u.richtung > 0 ? "good" : u.richtung < 0 ? "bad" : "neutral"}>
                  {u.richtung > 0 ? `${u.basis} stärker`
                    : u.richtung < 0 ? `${u.quote} stärker` : "keine Aussage"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const z = (v: number | null, n = 2) => (v === null ? "·" : v.toFixed(n));

/**
 * Die Währungen mit ihren Rohwerten und ihrer Aktualität.
 *
 * Genau das, was auf der Seite fehlte: nicht nur „EUR ist stark", sondern
 * woher das kommt, wie alt die Zahl ist — und ob die sieben Paare derselben
 * Währung dasselbe sagen oder sich widersprechen.
 */
export function WaehrungsTabelle({ waehrungen }: { waehrungen: WaehrungsBild[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Währung</th>
            <th className="px-2 py-2 text-right font-normal">Leitzins</th>
            <th className="px-2 py-2 text-right font-normal">6 M</th>
            <th className="px-2 py-2 text-right font-normal">Inflation</th>
            <th className="px-2 py-2 text-right font-normal">Real</th>
            <th className="px-2 py-2 text-right font-normal">COT-Pz.</th>
            <th className="px-2 py-2 text-right font-normal">Risiko</th>
            <th className="px-2 py-2 text-left font-normal">7 Paare</th>
            <th className="px-2 py-2 text-left font-normal">Stand</th>
          </tr>
        </thead>
        <tbody>
          {waehrungen.map((w) => (
            <tr key={w.ccy} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
              <td className="px-2 py-2 font-medium text-ink">{w.ccy}</td>
              <td className="num px-2 py-2 text-right text-ink-soft">{z(w.leitzins)}</td>
              <td className={cx("num px-2 py-2 text-right",
                (w.leitzins6M ?? 0) > 0 ? "text-good-bright"
                  : (w.leitzins6M ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {w.leitzins6M === null ? "·" : `${w.leitzins6M > 0 ? "+" : ""}${w.leitzins6M.toFixed(2)}`}
              </td>
              <td className="num px-2 py-2 text-right text-ink-soft">{z(w.cpi)}</td>
              <td className={cx("num px-2 py-2 text-right",
                (w.realzins ?? 0) > 0 ? "text-good-bright" : (w.realzins ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {z(w.realzins)}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                (w.cotRang ?? 50) >= 85 || (w.cotRang ?? 50) <= 15 ? "text-accent" : "text-ink-soft")}
                title={w.cotN > 0 ? `${w.cotN} Wochen Vergleichsbasis` : "keine Historie"}>
                {w.cotRang === null ? "·" : w.cotRang.toFixed(0)}
              </td>
              <td className="num px-2 py-2 text-right text-ink-muted">
                {w.risikoBeta > 0 ? "+" : ""}{w.risikoBeta}
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-1.5">
                  <span className="num text-xs text-good-bright">{w.dafuer}</span>
                  <span className="text-ink-faint">/</span>
                  <span className="num text-xs text-bad-bright">{w.dagegen}</span>
                  {w.strittig && <Badge tone="warn">strittig</Badge>}
                </span>
              </td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap gap-1">
                  <FrischeChip frische={w.leitzinsFrische} />
                  {w.cotFrische !== w.leitzinsFrische && <FrischeChip frische={w.cotFrische} />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        <strong>7 Paare</strong> zählt, in wie vielen der sieben eigenen Paare die
        Lage für bzw. gegen diese Währung spricht. „Strittig" heisst: beides kommt
        vor — dann ist die Währung nicht neutral, sondern gegen manche stark und
        gegen andere schwach. <strong>COT-Pz.</strong> ist der Perzentilrang der
        Leveraged Funds über drei Jahre; ab 85 bzw. unter 15 steht das Veto.
      </p>
    </div>
  );
}

/** Fehlende Quellen — sichtbar, nicht versteckt. */
export function Luecken({ leer, cotQuelle }: {
  leer: string[]; cotQuelle: Record<string, string>;
}) {
  const legacy = Object.entries(cotQuelle).filter(([, q]) => q === "legacy").map(([c]) => c);
  const keine = Object.entries(cotQuelle).filter(([, q]) => q === "keine").map(([c]) => c);
  if (leer.length === 0 && legacy.length === 0 && keine.length === 0) return null;

  return (
    <div className="rounded-xl bg-warn-tint px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
      <div className="mb-1 font-medium text-ink">Worauf das Urteil nicht beruht</div>
      <ul className="space-y-0.5">
        {leer.length > 0 && <li>· Ohne Daten: {leer.join(", ")}.</li>}
        {legacy.length > 0 && (
          <li>· {legacy.join(", ")}: COT aus dem Legacy-Report statt TFF —
            gröbere Trennung der Marktteilnehmer.</li>
        )}
        {keine.length > 0 && (
          <li>· {keine.join(", ")}: zu wenig COT-Historie für ein Perzentil, das Veto
            entfällt hier.</li>
        )}
      </ul>
    </div>
  );
}
