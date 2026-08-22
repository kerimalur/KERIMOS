import Link from "next/link";
import { Badge, Bar, cx } from "@/components/ui";
import { FRISCHE_LABEL, type Frische } from "@/lib/confluence/reihen";
import {
  URTEIL_LABEL, FAKTOR_ROLLE, AMPEL_LABEL, G8,
  type FaktorUrteil, type PaarUrteil, type RegimeLage,
  type VetoUrteil, type Urteilswort, type WaehrungsBild,
  type MatrixZelle, type Ampel, type AmpelUrteil,
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
        {aktiv && v.quellen.map((q) => (
          <Badge key={q} tone="warn">{q === "fonds" ? "Fonds" : "Real Money"}</Badge>
        ))}
        <span className="ml-auto"><FrischeChip frische={v.frische} /></span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{v.text}</p>
      {(v.banken.basis !== null || v.banken.quote !== null) && (
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Banken (Gegenseite, kein Veto): {v.banken.basis === null ? "·" : v.banken.basis.toFixed(0)}
          {" / "}{v.banken.quote === null ? "·" : v.banken.quote.toFixed(0)}. Perzentil
        </p>
      )}
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
                <a href={`/trading/backtest/rueckblick?paar=${u.paar}`}
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
 * Ein COT-Perzentil in der Tabelle.
 *
 * `veto` markiert die beiden Gruppen, die überhaupt ein Veto auslösen dürfen —
 * Fonds und Real Money. Nur bei ihnen wird ein Extrem hervorgehoben. Die
 * Banken-Zahl steht bewusst blass daneben: sie ist die Gegenposition der
 * anderen beiden und würde als Warnfarbe dieselbe Aussage doppelt zeigen.
 */
function PerzentilWert({ rang, veto = false }: { rang: number | null; veto?: boolean }) {
  if (rang === null) return <span className="text-ink-faint">·</span>;
  const extrem = veto && (rang >= 85 || rang <= 15);
  return (
    <span className={extrem ? "text-accent" : veto ? "text-ink-soft" : "text-ink-faint"}>
      {rang.toFixed(0)}
    </span>
  );
}

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
      <table className="w-full min-w-[840px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Währung</th>
            <th className="px-2 py-2 text-right font-normal">Leitzins</th>
            <th className="px-2 py-2 text-right font-normal">6 M</th>
            <th className="px-2 py-2 text-right font-normal"
                title="2-Jahres-Staatsanleihe und in Klammern der Abstand zum Leitzins — was der Markt an Zinsänderung einpreist.">
              2 J
            </th>
            <th className="px-2 py-2 text-right font-normal">Inflation</th>
            <th className="px-2 py-2 text-right font-normal">Real</th>
            <th className="px-2 py-2 text-right font-normal"
                title="COT-Perzentil: Fonds (Leveraged Funds) · Real Money (Asset Manager) · Banken (Dealer). Nur die ersten beiden lösen ein Veto aus; die Banken sind deren Gegenpartei.">
              COT F/RM/Bk
            </th>
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
              <td className="num px-2 py-2 text-right text-ink-soft"
                title={w.zweiJahr === null
                  ? "Für diese Währung gibt es keine freie 2-Jahres-Quelle — es wird bewusst keine Zahl erfunden."
                  : `2-Jahres-Rendite vom ${w.zweiJahrDatum ?? "?"}, Klammer = Abstand zum Leitzins.`}>
                {w.zweiJahr === null ? "·" : w.zweiJahr.toFixed(2)}
                {w.erwartung !== null && (
                  <span className={cx("ml-1 text-xs",
                    w.erwartung > 0 ? "text-good-bright"
                      : w.erwartung < 0 ? "text-bad-bright" : "text-ink-faint")}>
                    ({w.erwartung > 0 ? "+" : ""}{w.erwartung.toFixed(2)})
                  </span>
                )}
              </td>
              <td className="num px-2 py-2 text-right text-ink-soft">{z(w.cpi)}</td>
              <td className={cx("num px-2 py-2 text-right",
                (w.realzins ?? 0) > 0 ? "text-good-bright" : (w.realzins ?? 0) < 0 ? "text-bad-bright" : "text-ink-faint")}>
                {z(w.realzins)}
              </td>
              <td className="num px-2 py-2 text-right"
                title={`Fonds: ${w.cotN > 0 ? `${w.cotN} Wochen Vergleichsbasis` : "keine Historie"}`
                  + ` · Real Money: ${w.realMoneyN > 0 ? `${w.realMoneyN} Wochen` : "keine Historie"}`
                  + ` · Banken: ${w.bankenN > 0 ? `${w.bankenN} Wochen` : "keine Historie"} (nur Kontext, kein Veto)`}>
                <PerzentilWert rang={w.cotRang} veto />
                <span className="text-ink-faint">/</span>
                <PerzentilWert rang={w.realMoneyRang} veto />
                <span className="text-ink-faint">/</span>
                <PerzentilWert rang={w.bankenRang} />
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
        gegen andere schwach. <strong>COT F/RM/Bk</strong> sind die Perzentilränge
        über drei Jahre: Fonds, Real Money, Banken. Nur die ersten beiden lösen ab
        85 bzw. unter 15 ein Veto aus — die Banken sind deren Gegenpartei und
        stünden sonst doppelt im Urteil. <strong>2 J</strong> ist die
        Staatsanleihenrendite, in Klammern ihr Abstand zum Leitzins: was der Markt
        an Zinsänderung schon eingepreist hat.
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

/* ------------------------------------------------------------- Terminal */

const AMPEL_PUNKT: Record<Ampel, string> = {
  gruen: "bg-good-bright",
  gelb: "bg-warn",
  rot: "bg-ink-faint",
};

const AMPEL_FLAECHE: Record<Ampel, string> = {
  gruen: "bg-good-tint",
  gelb: "bg-warn-tint",
  rot: "bg-sand/40",
};

/**
 * Die Währungsleiste: acht Balken, stärkste oben.
 *
 * Der Score ist der Durchschnitt der sieben Netto-Werte einer Währung, auf sie
 * gedreht — also nicht „in wie vielen Paaren liegt sie vorne", sondern „wie
 * deutlich". Absichtlich als Balken und nicht als Note von 1 bis 10: eine Note
 * suggeriert eine Genauigkeit, die vier Faktoren nicht hergeben.
 */
export function WaehrungsLeiste({ waehrungen }: { waehrungen: WaehrungsBild[] }) {
  const groesster = Math.max(1, ...waehrungen.map((w) => Math.abs(w.score)));

  return (
    <ul className="space-y-1.5">
      {waehrungen.map((w) => (
        <li key={w.ccy} className="flex items-center gap-2.5">
          <span className="w-10 shrink-0 text-sm font-medium text-ink">{w.ccy}</span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-full bg-sand/60">
            <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
            <span
              className={cx("absolute inset-y-0 rounded-full",
                w.score >= 0 ? "bg-good-bright/70" : "bg-bad-bright/70")}
              style={{
                left: w.score >= 0 ? "50%" : `${50 - (Math.abs(w.score) / groesster) * 50}%`,
                width: `${(Math.abs(w.score) / groesster) * 50}%`,
              }} />
          </span>
          <span className={cx("num w-12 shrink-0 text-right text-xs",
            w.score > 0 ? "text-good-bright" : w.score < 0 ? "text-bad-bright" : "text-ink-faint")}>
            {w.score > 0 ? "+" : ""}{w.score.toFixed(0)}
          </span>
          <span className="w-16 shrink-0 text-right">
            {w.strittig
              ? <Badge tone="warn">strittig</Badge>
              : <span className="num text-[11px] text-ink-faint">{w.dafuer}/{w.dagegen}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Die Matrix: Zeile = Basis, Spalte = Quote.
 *
 * Eine Zeile lesen heisst „wie steht EUR gegen alle anderen", eine Spalte
 * lesen heisst „wer steht gegen den USD". Die untere Hälfte ist die
 * Spiegelung der oberen mit gedrehtem Vorzeichen — dieselbe Rechnung, nur
 * andersherum notiert. Die Ampelfarbe ist in beiden Hälften gleich, weil die
 * Frage „hat dieses Paar genug Substanz" nicht davon abhängen darf, wie herum
 * man es schreibt.
 */
export function PaarMatrix({ matrix }: { matrix: MatrixZelle[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="px-1.5 py-1 text-left text-[11px] font-normal text-ink-faint">
              Basis ╲ Quote
            </th>
            {G8.map((q) => (
              <th key={q} className="px-1.5 py-1 text-center text-[11px] font-normal text-ink-muted">
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((zeile, i) => (
            <tr key={G8[i]}>
              <th className="px-1.5 py-1 text-left text-[11px] font-medium text-ink-muted">
                {G8[i]}
              </th>
              {zeile.map((zelle) => (
                <td key={zelle.quote} className="p-0.5">
                  {zelle.basis === zelle.quote ? (
                    <div className="h-9 w-14 rounded-lg bg-sand/30" />
                  ) : (
                    <Link
                      href={`/trading/backtest/rueckblick?paar=${zelle.paar}`
                        + `&richtung=${zelle.richtung > 0 ? "long" : zelle.richtung < 0 ? "short" : ""}`}
                      title={`${zelle.basis}${zelle.quote}`
                        + `${zelle.gedreht ? ` (gerechnet als ${zelle.paar})` : ""} — `
                        + `${AMPEL_LABEL[zelle.stufe]}. ${zelle.grund} ${zelle.satz}`}
                      className={cx(
                        "flex h-9 w-14 flex-col items-center justify-center rounded-lg",
                        "transition duration-150 ease-tactile hover:ring-1 hover:ring-line active:scale-95",
                        AMPEL_FLAECHE[zelle.stufe],
                      )}>
                      <span className="flex items-center gap-1 leading-none">
                        <span className={cx("h-1.5 w-1.5 rounded-full", AMPEL_PUNKT[zelle.stufe])} />
                        <Pfeil dir={zelle.richtung} />
                      </span>
                      <span className="num text-[10px] leading-tight text-ink-faint">
                        {zelle.richtung === 0 ? "·" : (zelle.netto * 100).toFixed(0)}
                      </span>
                    </Link>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-good-bright align-middle" />
        handelbar ·
        <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
        nur mit gutem Chart ·
        <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-ink-faint align-middle" />
        nicht aus der Fundamentallage. Die Zahl ist das Netto ×100 in Richtung des
        Pfeils. Grün heisst <strong>nicht</strong> „kaufen" — es heisst, dass die
        Lage im Rücken steht, falls der Chart ein Setup hergibt.
      </p>
    </div>
  );
}

/** Nur die grünen Paare — stärkste zuerst. */
export function HandelbarListe({ handelbar }: {
  handelbar: { u: PaarUrteil; a: AmpelUrteil }[];
}) {
  if (handelbar.length === 0) {
    return (
      <p className="py-4 text-sm leading-relaxed text-ink-muted">
        Heute steht bei keinem der 28 Paare die Fundamentallage klar genug hinter
        einer Richtung. Das ist kein Fehler und auch kein schlechter Tag — ein
        Filter, der jeden Tag etwas durchlässt, filtert nicht.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {handelbar.map(({ u, a }) => (
        <li key={u.paar}>
          <Link
            href={`/trading/backtest/rueckblick?paar=${u.paar}`
              + `&richtung=${a.richtung > 0 ? "long" : "short"}`}
            title={u.satz}
            className="flex flex-wrap items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2 transition duration-150 ease-tactile hover:bg-sand active:scale-[0.99]">
            <span className="text-sm font-medium text-ink">
              {u.paar.slice(0, 3)}/{u.paar.slice(3)}
            </span>
            <Badge tone={a.richtung > 0 ? "good" : "bad"}>
              {a.richtung > 0 ? "LONG" : "SHORT"}
            </Badge>
            <span className="num text-xs text-ink-muted">
              {u.dafuer} dafür, {u.dagegen} dagegen
            </span>
            <span className="num ml-auto text-xs text-ink-soft">
              {u.netto > 0 ? "+" : ""}{(u.netto * 100).toFixed(0)}
            </span>
            <FrischeChip frische={u.frische} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
