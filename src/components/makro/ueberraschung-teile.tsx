import Link from "next/link";
import { Badge, cx } from "@/components/ui";
import {
  KATEGORIE_LABEL, QUELLE_LABEL, entscheidUrteil, fmtAbweichung, fmtWert, fmtZ, szenario,
  urteilUeberraschung, type Kategorie, type Release,
} from "@/lib/makro/releases";

/**
 * Bausteine für Erwartung gegen Ist (29.09.2026) — ohne Client-Zustand,
 * damit die Tabellen auf dem Server gerendert werden.
 *
 * Farbe heisst immer: grün = besser als erwartet = stützt die Währung,
 * rot = schlechter = belastet. Dazu steht jedes Mal das Vorzeichen, damit
 * die Aussage nicht an der Farbe allein hängt.
 */

const ZEIT = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
});
const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });
export const zeitKurz = (iso: string) => ZEIT.format(new Date(iso));
export const tagKurz = (iso: string) => TAG.format(new Date(iso));

/** Hintergrund und Textfarbe einer Zelle nach dem Überraschungswert. */
export function zellKlasse(x: number | null): string {
  if (x === null) return "border border-dashed border-line-strong bg-paper/40 text-ink-faint";
  if (x >= 1) return "bg-[#2F6B5B] text-ink";
  if (x >= 0.3) return "bg-good-tint text-good-bright";
  if (x > -0.3) return "bg-sand text-ink-soft";
  if (x > -1) return "bg-bad-tint text-bad-bright";
  return "bg-[#7A3B2E] text-ink";
}

export function tonKlasse(x: number | null): string {
  if (x === null) return "text-ink-faint";
  if (x > 0.05) return "text-good-bright";
  if (x < -0.05) return "text-bad-bright";
  return "text-ink-soft";
}

/** Balken um die Nulllinie, Ausschlag bis ±3. */
export function Wirkung({ z, breit = 120 }: { z: number | null; breit?: number }) {
  const w = z === null ? 0 : (Math.min(3, Math.abs(z)) / 3) * 50;
  const farbe = z === null ? "transparent" : z > 0.05 ? "#5FC2A6" : z < -0.05 ? "#E28B72" : "#9A8C74";
  return (
    <span className="relative inline-block h-2.5 rounded-full bg-sand align-middle" style={{ width: breit }}
      title={z === null ? "keine Abweichung" : `z ${fmtZ(z)}`}>
      <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-line-strong" />
      <span className="absolute top-0 bottom-0 rounded-full"
        style={{ left: `${z !== null && z < 0 ? 50 - w : 50}%`, width: `${Math.max(w, z === null ? 0 : 1.5)}%`, background: farbe }} />
    </span>
  );
}

export function QuellenMarke({ quelle }: { quelle: Release["ist_quelle"] }) {
  if (!quelle) return null;
  return (
    <span className={cx("rounded px-1 py-px text-[10px] font-medium uppercase tracking-wide",
      quelle === "rekonstruiert" ? "bg-warn-tint text-accent" : "bg-good-tint text-good-bright")}
      title={quelle === "rekonstruiert"
        ? "Ist aus dem Vorwert des Folgetermins — korrekt, aber erst verfügbar, wenn der nächste Termin im Kalender steht."
        : "Ist direkt aus der Quelle, kurz nach der Veröffentlichung."}>
      {QUELLE_LABEL[quelle]}
    </span>
  );
}

/* ---------------------------------------------------------- Matrix */

export type MatrixDaten = Record<string, Record<Kategorie | "gesamt", { wert: number | null; n: number }>>;

export function UeberraschungsMatrix({ matrix, waehrungen, zyklen }: {
  matrix: MatrixDaten;
  waehrungen: readonly string[];
  /** Je Währung Notenbank-Kürzel und Zyklus in Worten. */
  zyklen: Record<string, { bank: string; zyklus: string; ton: "gut" | "schlecht" | "neutral"; hinweis?: string | null }>;
}) {
  const zeilen: { key: Kategorie | "gesamt"; label: string; sub: string }[] = [
    { key: "wachstum", label: "Wachstum", sub: "PMI · BIP · Detailhandel" },
    { key: "inflation", label: "Inflation", sub: "höher = stützt" },
    { key: "arbeit", label: "Arbeitsmarkt", sub: "Jobs · Quote · Löhne" },
    { key: "gesamt", label: "Gesamt", sub: "alle drei, gewichtet" },
  ];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: "150px repeat(8, minmax(0, 1fr))" }}>
        <div />
        {waehrungen.map((c) => (
          <Link key={c} href={`/trading/waehrungen/${c}`}
            className="rounded-xl bg-sand py-2.5 text-center font-display text-sm font-bold text-ink-soft transition hover:bg-trading-bg hover:text-trading-bright">
            {c}
          </Link>
        ))}
        {zeilen.map((z) => (
          <MatrixZeile key={z.key} label={z.label} sub={z.sub}>
            {waehrungen.map((c) => {
              const zelle = matrix[c]?.[z.key] ?? { wert: null, n: 0 };
              const duenn = zelle.n < 3;
              return (
                <Link key={c} href={`/trading/waehrungen/${c}`}
                  title={`${c} · ${z.label}: ${urteilUeberraschung(zelle.wert)} · ${zelle.n} Veröffentlichungen in 45 Tagen`}
                  className={cx("flex min-h-[46px] flex-col items-center justify-center rounded-xl transition hover:brightness-110",
                    zellKlasse(zelle.wert), duenn && zelle.wert !== null && "opacity-60")}>
                  <span className="tabular font-mono text-sm">{fmtZ(zelle.wert)}</span>
                  <span className="text-[10px] opacity-80">{zelle.n} Werte</span>
                </Link>
              );
            })}
          </MatrixZeile>
        ))}
        <MatrixZeile label="Notenbank" sub="Zyklus automatisch">
          {waehrungen.map((c) => {
            const z = zyklen[c];
            return (
              <Link key={c} href={`/trading/waehrungen/${c}`} title={z?.hinweis ?? undefined}
                className={cx("flex min-h-[46px] flex-col items-center justify-center rounded-xl px-1 text-center transition hover:brightness-110",
                  z?.ton === "gut" ? "bg-good-tint text-good-bright" : z?.ton === "schlecht" ? "bg-bad-tint text-bad-bright" : "bg-warn-tint text-accent-soft")}>
                <span className="text-xs font-semibold">{z?.bank ?? "—"}</span>
                <span className="text-[10px] leading-tight opacity-90">{z?.zyklus ?? "unbekannt"}</span>
                {z?.hinweis && <span className="mt-0.5 text-[9px] leading-tight opacity-75">{z.hinweis.split(" (")[0]}</span>}
              </Link>
            );
          })}
        </MatrixZeile>
      </div>
    </div>
  );
}

function MatrixZeile({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-col justify-center pl-1">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="text-[11px] text-ink-faint">{sub}</span>
      </div>
      {children}
    </>
  );
}

/* ------------------------------------------------- Veröffentlichungen */

export function ReleaseTabelle({ releases, mitWaehrung = false, leer }: {
  releases: Release[];
  mitWaehrung?: boolean;
  leer: string;
}) {
  if (releases.length === 0) {
    return <p className="rounded-xl bg-sand/60 px-3 py-3 text-xs text-ink-muted">{leer}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
            <th className="pb-2 font-medium">Zeit</th>
            {mitWaehrung && <th className="pb-2 font-medium">Währung</th>}
            <th className="pb-2 font-medium">Veröffentlichung</th>
            <th className="pb-2 text-right font-medium">Vorwert</th>
            <th className="pb-2 text-right font-medium">Erwartung</th>
            <th className="pb-2 text-right font-medium">Ist</th>
            <th className="pb-2 text-right font-medium">Abw.</th>
            <th className="pb-2 pl-3 font-medium">Wirkung</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id} className="border-t border-line/60 align-middle">
              <td className="tabular whitespace-nowrap py-2 pr-3 text-xs text-ink-faint">{zeitKurz(r.event_time)}</td>
              {mitWaehrung && (
                <td className="py-2 pr-3">
                  <Link href={`/trading/waehrungen/${r.ccy}`} className="font-display text-xs font-bold text-ink-soft hover:text-accent-soft">
                    {r.ccy}
                  </Link>
                </td>
              )}
              <td className="py-2 pr-3">
                <span className="text-ink">{r.titel}</span>
                <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
                  {r.impact === "High" && <Badge tone="bad">High</Badge>}
                  {r.impact === "Medium" && <Badge tone="warn">Medium</Badge>}
                  <QuellenMarke quelle={r.ist_quelle} />
                </span>
              </td>
              <td className="tabular py-2 text-right font-mono text-xs text-ink-muted">{fmtWert(r.vorwert, r.einheit)}</td>
              <td className="tabular py-2 text-right font-mono text-xs text-ink-soft">{fmtWert(r.erwartung, r.einheit)}</td>
              <td className="tabular py-2 text-right font-mono text-xs font-medium text-ink">{fmtWert(r.ist, r.einheit)}</td>
              <td className={cx("tabular py-2 text-right font-mono text-xs", tonKlasse(r.z))}>
                {fmtAbweichung(r.abweichung, r.einheit)}
              </td>
              <td className="py-2 pl-3"><Wirkung z={r.z} breit={96} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Veröffentlichungen einer Währung, nach Kategorie gruppiert. */
export function ReleasesNachKategorie({ releases }: { releases: Release[] }) {
  const reihenfolge: Kategorie[] = ["wachstum", "inflation", "arbeit", "notenbank", "stimmung", "sonstiges"];
  const gruppen = reihenfolge
    .map((k) => ({ k, liste: releases.filter((r) => r.kategorie === k) }))
    .filter((g) => g.liste.length > 0);
  if (gruppen.length === 0) {
    return <p className="rounded-xl bg-sand/60 px-3 py-3 text-xs text-ink-muted">Keine Veröffentlichung in den letzten 45 Tagen.</p>;
  }
  return (
    <div className="space-y-5">
      {gruppen.map((g) => (
        <div key={g.k}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            {KATEGORIE_LABEL[g.k]}
            {g.k === "inflation" && <span className="ml-2 normal-case tracking-normal text-ink-faint">höher = Notenbank straffer = stützt</span>}
            {g.k === "arbeit" && <span className="ml-2 normal-case tracking-normal text-ink-faint">bei Arbeitslosigkeit und Anträgen gilt tiefer = besser</span>}
          </p>
          <ReleaseTabelle releases={g.liste} leer="" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ Notenbank */

export function EntscheidTabelle({ entscheide }: { entscheide: Release[] }) {
  if (entscheide.length === 0) {
    return <p className="rounded-xl bg-sand/60 px-3 py-3 text-xs text-ink-muted">Kein Zinsentscheid mit Erwartung im Kalender.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          <th className="pb-2 font-medium">Datum</th>
          <th className="pb-2 text-right font-medium">Vorher</th>
          <th className="pb-2 text-right font-medium">Erwartung</th>
          <th className="pb-2 text-right font-medium">Ist</th>
          <th className="pb-2 text-right font-medium">Urteil</th>
        </tr>
      </thead>
      <tbody>
        {entscheide.map((r) => {
          const u = entscheidUrteil(r);
          return (
            <tr key={r.id} className="border-t border-line/60">
              <td className="tabular py-2 text-xs text-ink-faint">{tagKurz(r.event_time)}</td>
              <td className="tabular py-2 text-right font-mono text-xs text-ink-muted">{fmtWert(r.vorwert, r.einheit)}</td>
              <td className="tabular py-2 text-right font-mono text-xs text-ink-soft">{fmtWert(r.erwartung, r.einheit)}</td>
              <td className="tabular py-2 text-right font-mono text-xs text-ink">{fmtWert(r.ist, r.einheit)}</td>
              <td className={cx("py-2 text-right text-xs",
                u.ton === "gut" ? "font-semibold text-good-bright" : u.ton === "schlecht" ? "font-semibold text-bad-bright"
                  : u.ton === "fehlt" ? "text-bad-bright/80" : "text-ink-soft")}>
                {u.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------ Als Nächstes */

export function NaechsteTermine({ termine }: { termine: Release[] }) {
  if (termine.length === 0) {
    return <p className="rounded-xl bg-sand/60 px-3 py-3 text-xs text-ink-muted">Kein wichtiger Termin in den nächsten 14 Tagen im Kalender.</p>;
  }
  return (
    <ul className="space-y-2">
      {termine.map((r) => (
        <li key={r.id} className="rounded-xl bg-sand/60 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-ink">{r.titel}</span>
            <span className="tabular whitespace-nowrap font-mono text-[11px] text-trading-bright">{zeitKurz(r.event_time)}</span>
          </div>
          {(r.erwartung !== null || r.vorwert !== null) && (
            <div className="mt-1 flex gap-4 font-mono text-[11px] text-ink-muted">
              <span>Erw. <span className="text-ink">{fmtWert(r.erwartung, r.einheit)}</span></span>
              <span>Vorwert {fmtWert(r.vorwert, r.einheit)}</span>
            </div>
          )}
          <p className="mt-1 text-xs leading-snug text-good-bright/90">{szenario(r)}</p>
        </li>
      ))}
    </ul>
  );
}

export function Datenluecken({ luecken }: { luecken: string[] }) {
  if (luecken.length === 0) {
    return <p className="text-xs text-good-bright">Keine Lücke — alle Zahlen da und aktuell.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {luecken.map((l) => (
        <li key={l} className="flex gap-2 text-xs leading-snug text-ink-soft">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" />
          {l}
        </li>
      ))}
    </ul>
  );
}
