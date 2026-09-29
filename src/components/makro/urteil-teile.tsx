import Link from "next/link";
import { cx } from "@/components/ui";
import { Info } from "@/components/makro/info";
import { ERKLAERUNG } from "@/lib/makro/erklaerungen";
import { fmtWert, type Release } from "@/lib/makro/releases";
import type { Feld, Grund, Kernzahl, Ton, UrteilBild, UrteilWort } from "@/lib/makro/urteil";

/**
 * Anzeige des Urteils (29.09.2026): zuerst die Aussage, dann das Warum, die
 * Rohdaten nur im Pop-up. Grün = stützt die Währung, rot = belastet; dazu
 * immer ein Wort oder Pfeil, damit nichts an der Farbe allein hängt.
 */

const TON_TEXT: Record<Ton, string> = {
  gut: "text-good-bright", schlecht: "text-bad-bright", neutral: "text-ink-soft", fehlt: "text-ink-faint",
};
const TON_FLAECHE: Record<Ton, string> = {
  gut: "bg-good-tint", schlecht: "bg-bad-tint", neutral: "bg-sand", fehlt: "bg-sand/40",
};
const TON_ZEICHEN: Record<Ton, string> = { gut: "▲", schlecht: "▼", neutral: "●", fehlt: "○" };

export function UrteilMarke({ wort, gross = false }: { wort: UrteilWort; gross?: boolean }) {
  const stil = wort === "bullish" ? "bg-[#2F6B5B] text-ink"
    : wort === "leicht bullish" ? "bg-good-tint text-good-bright"
      : wort === "bearish" ? "bg-[#7A3B2E] text-ink"
        : wort === "leicht bearish" ? "bg-bad-tint text-bad-bright"
          : "bg-sand text-ink-soft";
  return (
    <span className={cx("inline-flex items-center rounded-lg font-semibold", stil,
      gross ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs")}>
      {wort === "bullish" || wort === "leicht bullish" ? "▲ " : wort === "bearish" || wort === "leicht bearish" ? "▼ " : ""}
      {wort}
    </span>
  );
}

/** Balken −1 … +1 um die Mitte. */
export function UrteilBalken({ score, breit = 120 }: { score: number | null; breit?: number }) {
  const w = score === null ? 0 : Math.min(1, Math.abs(score)) * 50;
  return (
    <span className="relative inline-block h-2 rounded-full bg-sand align-middle" style={{ width: breit }}>
      <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-line-strong" />
      {score !== null && (
        <span className={cx("absolute top-0 bottom-0 rounded-full", score >= 0 ? "bg-good" : "bg-bad")}
          style={{ left: `${score >= 0 ? 50 : 50 - w}%`, width: `${Math.max(w, 1.5)}%` }} />
      )}
    </span>
  );
}

export function FeldChip({ label, feld, info }: { label: string; feld: Feld; info: string }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs", TON_FLAECHE[feld.ton])}>
      <span className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">{label}</span>
      <span className={cx("truncate font-medium", TON_TEXT[feld.ton])}>{feld.kurz}</span>
      <Info titel={label}>
        <span className="block">{feld.lang}</span>
        <span className="mt-2 block text-ink-faint">{info}</span>
      </Info>
    </span>
  );
}

/* ------------------------------------------------- Übersichtszeile */

export function WaehrungsZeile({ u, rang }: { u: UrteilBild; rang: number }) {
  return (
    <Link href={`/trading/waehrungen/${u.ccy}`}
      className="group grid items-center gap-x-4 gap-y-2 rounded-2xl bg-sand/40 px-4 py-3 transition hover:bg-sand/80
                 md:grid-cols-[28px_64px_150px_minmax(0,1fr)_16px]">
      <span className="tabular hidden text-xs text-ink-faint md:block">{rang}.</span>
      <span className="font-display text-xl font-bold text-ink">{u.ccy}</span>
      <span className="flex flex-col gap-1.5">
        <UrteilMarke wort={u.wort} />
        <UrteilBalken score={u.score} breit={120} />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap gap-1.5">
          <FeldChip label="Zentralbank" feld={u.felder.zentralbank} info={ERKLAERUNG.zentralbank} />
          <FeldChip label="Wirtschaft" feld={u.felder.wirtschaft} info={ERKLAERUNG.wirtschaft} />
          <FeldChip label="Überraschung" feld={u.felder.ueberraschung} info={ERKLAERUNG.ueberraschung} />
        </span>
        {u.gruende[0] && (
          <span className="truncate text-xs text-ink-muted">
            <span className={TON_TEXT[u.gruende[0].ton]}>{TON_ZEICHEN[u.gruende[0].ton]}</span> {u.gruende[0].text}
          </span>
        )}
        {u.nachricht && (
          <span className="truncate text-xs text-accent-soft">⚡ {u.nachricht.titel}: {fmtWert(u.nachricht.ist, u.nachricht.einheit)} statt {fmtWert(u.nachricht.erwartung, u.nachricht.einheit)}</span>
        )}
      </span>
      <span className="hidden text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink md:block">→</span>
    </Link>
  );
}

/* ------------------------------------------------------ Gründe */

export function GruendeListe({ gruende }: { gruende: Grund[] }) {
  if (gruende.length === 0) {
    return <p className="text-sm text-ink-muted">Zu wenig Daten für eine Begründung.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {gruende.map((g) => (
        <li key={g.text} className="flex gap-2.5 text-sm leading-snug text-ink-soft">
          <span className={cx("mt-0.5 w-3 shrink-0 text-xs", TON_TEXT[g.ton])}>{TON_ZEICHEN[g.ton]}</span>
          <span>{g.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------- Kernzahlen */

export function KernKarte({ k, info }: { k: Kernzahl; info?: string }) {
  return (
    <div className={cx("rounded-xl px-3 py-2.5", k.ton === "fehlt" ? "bg-sand/30" : "bg-sand/60")}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-ink-muted">{k.label}</span>
        {(k.details.length > 0 || info) && (
          <Info titel={k.label}>
            {k.details.map((d) => <span key={d} className="block">{d}</span>)}
            {info && <span className="mt-2 block text-ink-faint">{info}</span>}
          </Info>
        )}
        {k.datum && <span className="ml-auto text-[10px] text-ink-faint">{k.datum}</span>}
      </div>
      {k.fehlt ? (
        <p className="mt-1 text-sm text-ink-faint">fehlt · {k.fehlt}</p>
      ) : (
        <>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="tabular font-mono text-lg text-ink">{k.wert}</span>
            {k.trend && <span className="text-xs text-ink-muted">{k.trend}</span>}
            {k.niveau && <span className={cx("text-xs", TON_TEXT[k.ton])}>{k.niveau}</span>}
          </p>
          {k.vergleich && <p className={cx("text-xs", TON_TEXT[k.ton])}>{TON_ZEICHEN[k.ton]} {k.vergleich}</p>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------- Grosse Überraschungen */

const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });

export function GrosseUeberraschungen({ liste, ccy }: { liste: Release[]; ccy: string }) {
  if (liste.length === 0) {
    return <p className="text-sm text-ink-muted">Keine grosse Abweichung in den letzten 30 Tagen — die Daten kamen etwa wie erwartet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {liste.map((r) => {
        const gut = (r.z ?? 0) > 0;
        return (
          <li key={r.id} className={cx("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl px-3 py-2", gut ? "bg-good-tint" : "bg-bad-tint")}>
            <span className={cx("text-xs", gut ? "text-good-bright" : "text-bad-bright")}>{gut ? "▲" : "▼"}</span>
            <span className="text-sm text-ink">{r.titel}</span>
            <span className="tabular font-mono text-xs text-ink-soft">
              {fmtWert(r.ist, r.einheit)} statt {fmtWert(r.erwartung, r.einheit)}
            </span>
            <span className="ml-auto text-[11px] text-ink-faint">
              {TAG.format(new Date(r.event_time))} · {gut ? "stützt" : "belastet"} {ccy}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
