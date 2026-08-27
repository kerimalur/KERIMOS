"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Input, Label, cx } from "@/components/ui";
import { DatumWaehler } from "@/components/datum-waehler";
import { useFensterDokument } from "@/components/pip-fenster";
import { addBacktestTrade } from "@/lib/backtest-actions";
import {
  RESULT_LABEL, berechneR, verlaufFeld, verlaufReihe, R_FAKTOR_STANDARD,
  GEGENLAUF_LABEL, VORLAUF_LABEL, VERLAUF_FRAGE,
  type BacktestCategory, type BacktestResult,
} from "@/lib/backtest-types";

/**
 * Trade erfassen — eine Frage pro Bild.
 *
 * Ersetzt das lange Formular in der Eintragen-Ansicht. Der Grund ist nicht
 * Optik, sondern Vollständigkeit: im Formular war kein Feld Pflicht, also
 * blieben Verlauf, Confluences und die Begründung eines Stopouts genau dann
 * leer, wenn es eilig war — und damit reihenweise bei den Trades, aus denen
 * man am meisten lernt.
 *
 * Damit das nicht in Langsamkeit umschlägt, gilt durchgehend:
 *
 * - **Einfachauswahl springt selbst weiter.** Ein Klick, ein Bild weiter.
 * - **Zifferntasten wählen.** 1 = erste Kachel, 2 = zweite, … Damit läuft der
 *   ganze Trade ohne Maus, was das alte Formular nie konnte (Confluences
 *   waren dort immer Klickarbeit).
 * - **Nur gefragt wird, was diese Antwort auch braucht.** SL und Breakeven
 *   überspringen das RR — dort ist das R per Definition -1 bzw. 0. Ein Skip
 *   überspringt alles ausser dem Grund.
 * - **Am Ende steht eine Übersicht.** Jede Zeile springt zurück zu ihrem
 *   Schritt. Ohne die wäre ein Tippfehler in Schritt 2 erst in der
 *   Auswertung aufgefallen.
 *
 * Der Bearbeiten-Fall bleibt bewusst beim klassischen Formular
 * (`backtest-trade-form.tsx`): wer eine einzelne Zahl korrigiert, will nicht
 * durch neun Bilder laufen.
 */

type Schritt =
  | "datum" | "richtung" | "gva" | "ergebnis" | "skipgrund" | "rr"
  | "verlauf" | "confluence" | "anmerkung" | "learning" | "abschluss" | "check";

interface Option {
  wert: string;
  label: string;
  /** Kleingedrucktes unter dem Label — erklärt die Kachel, ohne sie zu verlängern. */
  hinweis?: string;
}

interface Entwurf {
  datum: string;
  direction: "" | "long" | "short";
  gvaTypId: string;
  /** "keine Angabe" ist eine Antwort — ohne das Flag wäre sie von "noch nichts" nicht zu unterscheiden. */
  gvaBeantwortet: boolean;
  result: BacktestResult | "";
  skipGrundId: string;
  rr: string;
  /** Leer = R kommt aus dem Faktor. Sonst gilt dieser Wert. */
  rManuell: string;
  verlauf: string;
  confluence: string[];
  anmerkung: string[];
  notiz: string;
  link: string;
  screenshot: string;
}

const leererEntwurf = (datum: string): Entwurf => ({
  datum, direction: "", gvaTypId: "", gvaBeantwortet: false, result: "",
  skipGrundId: "", rr: "", rManuell: "", verlauf: "",
  confluence: [], anmerkung: [], notiz: "", link: "", screenshot: "",
});

/** Kürzer als das ist keine Begründung, sondern ein Haken. */
const MIN_LEARNING = 12;

const FRAGE: Record<Schritt, string> = {
  datum: "Wann war der Trade?",
  richtung: "Long oder Short?",
  gva: "Welche GVA?",
  ergebnis: "Wie ist er ausgegangen?",
  skipgrund: "Warum nicht genommen?",
  rr: "Welches RR war geplant?",
  verlauf: "",            // kommt aus VERLAUF_FRAGE
  confluence: "Was lag zusammen?",
  anmerkung: "Was war noch auffällig?",
  learning: "Woran lag der Stopout?",
  abschluss: "Chart und Notiz",
  check: "Passt das so?",
};

export function BacktestTradeWizard({
  sessionId, pair, kategorien, standardDatum, slNotizen = [],
}: {
  sessionId: string;
  pair: string;
  standardDatum: string;
  kategorien: {
    gvaTyp: BacktestCategory | null;
    confluence: BacktestCategory | null;
    anmerkung: BacktestCategory | null;
    skipGrund: BacktestCategory | null;
  };
  /**
   * Begründungen früherer Stopouts, neueste zuerst. Als Bausteine anklickbar —
   * die Pflichtnotiz soll ehrlich bleiben, aber nicht jedes Mal von Hand
   * getippt werden müssen.
   */
  slNotizen?: string[];
}) {
  const [entwurf, setEntwurf] = useState<Entwurf>(() => leererEntwurf(standardDatum));
  const [idx, setIdx] = useState(0);
  const [gezeigterFehler, setGezeigterFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(0);
  const [serverFehler, setServerFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  // Im Schwebefenster ist das globale `document` das der Hauptseite — Tasten
  // und Fokus liegen dann im falschen Dokument. Deshalb immer das des
  // umgebenden Fensters nehmen.
  const dok = useFensterDokument();

  const setzeFeld = <K extends keyof Entwurf>(k: K, v: Entwurf[K]) => {
    setGezeigterFehler(null);
    setEntwurf((e) => ({ ...e, [k]: v }));
  };

  /* ------------------------------------------------------ Ablauf bestimmen */

  const schritte = useMemo<Schritt[]>(() => {
    const s: Schritt[] = ["datum", "richtung"];
    if (kategorien.gvaTyp) s.push("gva");
    s.push("ergebnis");
    if (entwurf.result === "skip") {
      if (kategorien.skipGrund) s.push("skipgrund");
    } else if (entwurf.result !== "") {
      if (entwurf.result === "full_tp" || entwurf.result === "teil_tp_be") s.push("rr");
      if (verlaufFeld(entwurf.result)) s.push("verlauf");
      if (kategorien.confluence) s.push("confluence");
      if (kategorien.anmerkung) s.push("anmerkung");
      if (entwurf.result === "sl") s.push("learning");
    }
    s.push("abschluss", "check");
    return s;
  }, [entwurf.result, kategorien]);

  const position = Math.min(idx, schritte.length - 1);
  const schritt = schritte[position];

  /* ----------------------------------------------------------- Rechenwerte */

  const rrZahl = entwurf.rr.trim() === "" ? null : Number(entwurf.rr.replace(",", "."));
  const rAuto = entwurf.result === ""
    ? null
    : berechneR(entwurf.result, Number.isFinite(rrZahl as number) ? rrZahl : null);
  const rWert = entwurf.rManuell.trim() !== ""
    ? entwurf.rManuell.replace(",", ".")
    : (rAuto === null ? "" : String(rAuto));

  const verlaufsFeld = entwurf.result === "" ? null : verlaufFeld(entwurf.result);

  /* --------------------------------------------------- Optionen je Schritt */

  const optionen = useMemo<Option[]>(() => {
    switch (schritt) {
      case "richtung":
        return [{ wert: "long", label: "Long" }, { wert: "short", label: "Short" }];
      case "gva":
        return [
          ...(kategorien.gvaTyp?.tags ?? []).map((t) => ({ wert: t.id, label: t.label })),
          { wert: "", label: "keine Angabe" },
        ];
      case "ergebnis":
        return (Object.keys(RESULT_LABEL) as BacktestResult[]).map((w) => ({
          wert: w,
          label: RESULT_LABEL[w],
          hinweis:
            w === "full_tp" ? "Faktor 0,81 × RR"
              : w === "teil_tp_be" ? "Faktor 0,31 × RR"
                : w === "sl" ? "−1 R, fix"
                  : w === "breakeven" ? "0 R" : "zählt nicht in die Statistik",
        }));
      case "skipgrund":
        return (kategorien.skipGrund?.tags ?? []).map((t) => ({ wert: t.id, label: t.label }));
      case "verlauf": {
        if (!verlaufsFeld || entwurf.result === "") return [];
        const label: Record<string, string> =
          verlaufsFeld === "gegenlauf" ? GEGENLAUF_LABEL : VORLAUF_LABEL;
        // Nicht die volle Reihe: beim Breakeven fällt "nie im Plus" weg, weil
        // BE erst ab dem -0.27er Level gesetzt wird.
        return verlaufReihe(entwurf.result).map((w) => ({ wert: w, label: label[w] }));
      }
      case "confluence":
        return (kategorien.confluence?.tags ?? []).map((t) => ({ wert: t.id, label: t.label }));
      case "anmerkung":
        return (kategorien.anmerkung?.tags ?? []).map((t) => ({ wert: t.id, label: t.label }));
      default:
        return [];
    }
  }, [schritt, kategorien, verlaufsFeld, entwurf.result]);

  const istMehrfach = schritt === "confluence" || schritt === "anmerkung";

  /* -------------------------------------------------------------- Prüfung */

  function fehltBei(s: Schritt): string | null {
    switch (s) {
      case "datum":
        return /^\d{4}-\d{2}-\d{2}$/.test(entwurf.datum) ? null : "Ohne Datum geht es nicht weiter.";
      case "richtung":
        return entwurf.direction === "" ? "Long oder Short wählen." : null;
      case "gva":
        return entwurf.gvaBeantwortet ? null : "Eine Kachel wählen — „keine Angabe“ zählt auch.";
      case "ergebnis":
        return entwurf.result === "" ? "Ergebnis wählen." : null;
      case "skipgrund":
        return entwurf.skipGrundId === "" ? "Grund wählen — sonst ist der Skip nicht auswertbar." : null;
      case "rr":
        return rrZahl !== null && Number.isFinite(rrZahl) && (rrZahl as number) > 0
          ? null : "Geplantes RR eintragen, z. B. 3.";
      case "verlauf":
        return entwurf.verlauf === "" ? "Einschätzen reicht — aber eine Kachel muss es sein." : null;
      case "learning":
        return entwurf.notiz.trim().length >= MIN_LEARNING
          ? null
          : "Ein Satz dazu, was schieflief oder was du nächstes Mal anders machst.";
      default:
        return null;
    }
  }

  /* ----------------------------------------------------------- Navigation */

  const vor = () => {
    const p = fehltBei(schritt);
    if (p) { setGezeigterFehler(p); return; }
    setGezeigterFehler(null);
    if (position < schritte.length - 1) setIdx(position + 1);
  };
  const zurueck = () => { setGezeigterFehler(null); if (position > 0) setIdx(position - 1); };
  const zuSchritt = (s: Schritt) => {
    const i = schritte.indexOf(s);
    if (i >= 0) { setGezeigterFehler(null); setIdx(i); }
  };

  /** Einfachauswahl: setzen und von selbst weiterspringen. */
  const waehleEinzeln = (patch: Partial<Entwurf>) => {
    setGezeigterFehler(null);
    setEntwurf((e) => ({ ...e, ...patch }));
    // Kurz stehen lassen, damit die Kachel sichtbar einrastet — ohne das
    // verschwindet das Bild, bevor man gesehen hat, was man getroffen hat.
    window.setTimeout(() => setIdx(position + 1), 130);
  };

  const toggle = (feld: "confluence" | "anmerkung", id: string) =>
    setEntwurf((e) => ({
      ...e,
      [feld]: e[feld].includes(id) ? e[feld].filter((x) => x !== id) : [...e[feld], id],
    }));

  /** Was eine Kachel an dieser Stelle auslöst. */
  const kachelKlick = (wert: string) => {
    switch (schritt) {
      case "richtung": return waehleEinzeln({ direction: wert as "long" | "short" });
      case "gva": return waehleEinzeln({ gvaTypId: wert, gvaBeantwortet: true });
      case "ergebnis": {
        const neu = wert as BacktestResult;
        // Wechselt das Ergebnis, passt der Rest nicht mehr: RR und Verlauf
        // gehören zum alten Ausgang und würden sonst stehen bleiben.
        return waehleEinzeln(
          neu === entwurf.result
            ? { result: neu }
            : { result: neu, verlauf: "", rManuell: "", rr: neu === "skip" ? "" : entwurf.rr },
        );
      }
      case "skipgrund": return waehleEinzeln({ skipGrundId: wert });
      case "verlauf": return waehleEinzeln({ verlauf: wert });
      case "confluence": return toggle("confluence", wert);
      case "anmerkung": return toggle("anmerkung", wert);
      default: return;
    }
  };

  const istGewaehlt = (wert: string) => {
    switch (schritt) {
      case "richtung": return entwurf.direction === wert;
      case "gva": return entwurf.gvaBeantwortet && entwurf.gvaTypId === wert;
      case "ergebnis": return entwurf.result === wert;
      case "skipgrund": return entwurf.skipGrundId === wert;
      case "verlauf": return entwurf.verlauf === wert;
      case "confluence": return entwurf.confluence.includes(wert);
      case "anmerkung": return entwurf.anmerkung.includes(wert);
      default: return false;
    }
  };

  /* ------------------------------------------------------------ Speichern */

  function speichern() {
    for (const s of schritte) {
      const p = fehltBei(s);
      if (p) { zuSchritt(s); setGezeigterFehler(p); return; }
    }
    const fd = new FormData();
    fd.set("session_id", sessionId);
    fd.set("occurred_on", entwurf.datum);
    fd.set("direction", entwurf.direction);
    fd.set("result", entwurf.result);
    fd.set("r_multiple", entwurf.result === "skip" ? "" : rWert);
    fd.set("rr_geplant", entwurf.result === "skip" ? "" : entwurf.rr.replace(",", "."));
    fd.set("notiz", entwurf.notiz);
    fd.set("tradingview_link", entwurf.link);
    fd.set("screenshot_url", entwurf.screenshot);
    if (verlaufsFeld && entwurf.verlauf) fd.set(verlaufsFeld, entwurf.verlauf);
    if (entwurf.gvaTypId) fd.append("gva_typ", entwurf.gvaTypId);
    if (entwurf.skipGrundId) fd.append("skip_grund", entwurf.skipGrundId);
    for (const id of entwurf.confluence) fd.append("confluence", id);
    for (const id of entwurf.anmerkung) fd.append("anmerkung", id);

    setServerFehler(null);
    starte(async () => {
      try {
        await addBacktestTrade(fd);
        // Das Datum bleibt stehen: man arbeitet einen Zeitraum der Reihe nach
        // durch, der nächste Trade ist fast immer derselbe oder der nächste Tag.
        setEntwurf(leererEntwurf(entwurf.datum));
        setIdx(0);
        setGespeichert((n) => n + 1);
      } catch (e) {
        setServerFehler(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    });
  }

  /* ------------------------------------------------------------- Tastatur */

  // Frischer Closure pro Render, damit der Handler nie auf altem Zustand sitzt.
  const taste = useRef<(e: KeyboardEvent) => void>(() => {});
  taste.current = (ev: KeyboardEvent) => {
    if (laeuft || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const el = (dok ?? document).activeElement as HTMLElement | null;
    const drin = !el || el === (dok ?? document).body || (wrap.current?.contains(el) ?? false);
    if (!drin) return;
    const tippt = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

    if (ev.key === "Enter") {
      if (tippt && el?.tagName === "TEXTAREA" && ev.shiftKey) return;
      ev.preventDefault();
      if (schritt === "check") speichern(); else vor();
      return;
    }
    if (tippt) return;   // ab hier darf nichts das Tippen kapern

    if (ev.key === "ArrowRight") { ev.preventDefault(); if (schritt === "check") speichern(); else vor(); return; }
    if (ev.key === "ArrowLeft" || ev.key === "Backspace") { ev.preventDefault(); zurueck(); return; }
    if (/^[1-9]$/.test(ev.key)) {
      const o = optionen[Number(ev.key) - 1];
      if (o) { ev.preventDefault(); kachelKlick(o.wert); }
    }
  };

  useEffect(() => {
    const ziel = dok ?? document;
    const f = (e: KeyboardEvent) => taste.current(e);
    ziel.addEventListener("keydown", f);
    return () => ziel.removeEventListener("keydown", f);
  }, [dok]);

  /* ------------------------------------------------------------ Beschriftung */

  const label = (kat: BacktestCategory | null, id: string) =>
    kat?.tags.find((t) => t.id === id)?.label ?? "—";
  const labelListe = (kat: BacktestCategory | null, ids: string[]) =>
    ids.length === 0 ? "—" : ids.map((i) => label(kat, i)).join(", ");
  const datumLesbar = entwurf.datum
    ? new Date(`${entwurf.datum}T12:00:00Z`).toLocaleDateString("de-CH",
      { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  const frage = schritt === "verlauf" && verlaufsFeld
    ? VERLAUF_FRAGE[verlaufsFeld] : FRAGE[schritt];

  /* ---------------------------------------------------------------- Bild */

  return (
    <div ref={wrap} className="min-h-[22rem]">
      <Fortschritt position={position} anzahl={schritte.length} pair={pair}
        gespeichert={gespeichert} />

      <Bisher entwurf={entwurf} schritt={schritt} kategorien={kategorien}
        datumLesbar={datumLesbar} rWert={rWert} zuSchritt={zuSchritt} />

      <h3 className="mt-4 text-lg font-medium text-ink">{frage}</h3>

      <div className="mt-3">
        {schritt === "datum" && (
          <DatumWaehler name="occurred_on_wizard" standard={entwurf.datum}
            onChange={(iso) => setzeFeld("datum", iso)} />
        )}

        {optionen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {optionen.map((o, i) => (
              <Kachel key={`${o.wert}-${i}`} nummer={i + 1} option={o}
                aktiv={istGewaehlt(o.wert)} onClick={() => kachelKlick(o.wert)} />
            ))}
          </div>
        )}

        {schritt === "rr" && (
          <div className="max-w-xs space-y-2">
            <Input autoFocus inputMode="decimal" type="number" step="0.01" min="0"
              value={entwurf.rr} placeholder="z. B. 3"
              onChange={(e) => setzeFeld("rr", e.target.value)} />
            <p className="text-xs text-ink-muted">
              {rAuto === null
                ? "Sobald das RR steht, rechnet sich das erreichte R von selbst."
                : <>ergibt <span className="tabular font-medium text-ink">{rAuto} R</span>{" "}
                  <span className="text-ink-faint">
                    (Faktor {R_FAKTOR_STANDARD[entwurf.result as BacktestResult]} — Einstieg sitzt
                    selten exakt am Fib, Spread kommt dazu)
                  </span></>}
            </p>
            {entwurf.rManuell.trim() === "" ? (
              <button type="button" onClick={() => setzeFeld("rManuell", String(rAuto ?? ""))}
                className="text-xs text-accent-soft hover:underline">
                R wich davon ab?
              </button>
            ) : (
              <div className="flex items-end gap-2">
                <div className="w-28">
                  <Label htmlFor="r-manuell">R von Hand</Label>
                  <Input id="r-manuell" type="number" step="0.01" value={entwurf.rManuell}
                    onChange={(e) => setzeFeld("rManuell", e.target.value)} />
                </div>
                <button type="button" onClick={() => setzeFeld("rManuell", "")}
                  className="pb-2 text-xs text-ink-muted hover:text-ink">
                  zurück zur Berechnung
                </button>
              </div>
            )}
          </div>
        )}

        {schritt === "learning" && (
          <div className="space-y-2">
            <textarea autoFocus rows={3} value={entwurf.notiz}
              onChange={(e) => setzeFeld("notiz", e.target.value)}
              placeholder="z. B. Zone war nicht frisch, ich habe den zweiten Test genommen — beim nächsten Mal nur die erste Berührung."
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink
                         placeholder:text-ink-faint outline-none transition
                         hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20" />
            <p className="text-[11px] text-ink-faint">
              Pflichtfeld — das ist die einzige Spalte, die aus einem Verlust etwas macht.
              Enter speichert nicht, Shift+Enter macht einen Absatz.
            </p>
            {slNotizen.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {slNotizen.map((n) => (
                  <button key={n} type="button" onClick={() => setzeFeld("notiz", n)}
                    className="max-w-[16rem] truncate rounded-lg border border-line bg-sand px-2 py-1
                               text-[11px] text-ink-muted transition hover:border-line-strong hover:text-ink">
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {schritt === "abschluss" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="w-link">TradingView-Link</Label>
                <Input id="w-link" autoFocus value={entwurf.link}
                  placeholder="https://www.tradingview.com/x/..."
                  onChange={(e) => setzeFeld("link", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="w-shot">Screenshot-URL</Label>
                <Input id="w-shot" value={entwurf.screenshot} placeholder="https://..."
                  onChange={(e) => setzeFeld("screenshot", e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="w-notiz">
                {entwurf.result === "sl" ? "Learning (aus dem letzten Schritt)" : "Notiz (freiwillig)"}
              </Label>
              <Input id="w-notiz" value={entwurf.notiz} placeholder="Freitext"
                onChange={(e) => setzeFeld("notiz", e.target.value)} />
            </div>
            <p className="text-[11px] text-ink-faint">
              Aus einem geteilten Chart-Link zieht die Auswertung das Bild automatisch —
              eine Screenshot-URL braucht es dann nicht.
            </p>
          </div>
        )}

        {schritt === "check" && (
          <Uebersicht entwurf={entwurf} kategorien={kategorien} datumLesbar={datumLesbar}
            rWert={rWert} verlaufsFeld={verlaufsFeld} label={label} labelListe={labelListe}
            zuSchritt={zuSchritt} schritte={schritte} />
        )}
      </div>

      {(gezeigterFehler || serverFehler) && (
        <p className="mt-3 text-xs text-bad">{serverFehler ?? gezeigterFehler}</p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <button type="button" onClick={zurueck} disabled={position === 0}
          className="rounded-xl border border-line bg-sand px-3 py-2 text-sm text-ink-soft
                     transition hover:border-line-strong hover:text-ink disabled:opacity-30">
          ← Zurück
        </button>
        {schritt === "check" ? (
          <Button type="button" onClick={speichern} disabled={laeuft}>
            {laeuft ? "Speichert…" : "Trade speichern"}
          </Button>
        ) : (
          <Button type="button" onClick={vor}>
            Weiter →
          </Button>
        )}
        {schritt === "check" && (
          <button type="button" onClick={() => { setEntwurf(leererEntwurf(entwurf.datum)); setIdx(0); }}
            className="text-xs text-ink-muted transition hover:text-ink-soft">
            verwerfen
          </button>
        )}
        <span className="ml-auto hidden text-[11px] text-ink-faint sm:block">
          {istMehrfach ? "Ziffern schalten um · Enter weiter" : "Ziffern wählen · Enter weiter · ← zurück"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Bausteine */

function Fortschritt({
  position, anzahl, pair, gespeichert,
}: { position: number; anzahl: number; pair: string; gespeichert: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
        <span>Schritt {position + 1} von {anzahl} · {pair}</span>
        {gespeichert > 0 && (
          <span className="text-accent-soft">
            {gespeichert} {gespeichert === 1 ? "Trade" : "Trades"} in dieser Sitzung erfasst
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-accent transition-all duration-200 ease-tactile"
          style={{ width: `${((position + 1) / anzahl) * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * Was bisher steht, in einer Zeile.
 *
 * Ein Wizard nimmt einem den Überblick weg — das ist sein Preis. Diese
 * Zeile gibt ihn zurück, ohne den Fokus zu zerstreuen, und jeder Eintrag
 * springt zu seinem Schritt zurück.
 */
function Bisher({
  entwurf, schritt, kategorien, datumLesbar, rWert, zuSchritt,
}: {
  entwurf: Entwurf; schritt: Schritt; datumLesbar: string; rWert: string;
  kategorien: { gvaTyp: BacktestCategory | null; skipGrund: BacktestCategory | null;
    confluence: BacktestCategory | null; anmerkung: BacktestCategory | null };
  zuSchritt: (s: Schritt) => void;
}) {
  const teile: { s: Schritt; text: string }[] = [];
  if (schritt !== "datum" && entwurf.datum) teile.push({ s: "datum", text: datumLesbar });
  if (entwurf.direction) teile.push({ s: "richtung", text: entwurf.direction === "long" ? "Long" : "Short" });
  if (entwurf.gvaBeantwortet && entwurf.gvaTypId) {
    teile.push({ s: "gva", text: kategorien.gvaTyp?.tags.find((t) => t.id === entwurf.gvaTypId)?.label ?? "GVA" });
  }
  if (entwurf.result) {
    teile.push({
      s: "ergebnis",
      text: RESULT_LABEL[entwurf.result] + (rWert !== "" && entwurf.result !== "skip" ? ` · ${rWert} R` : ""),
    });
  }
  if (entwurf.confluence.length > 0) {
    teile.push({ s: "confluence", text: `${entwurf.confluence.length} Confluence` });
  }
  if (teile.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {teile.map((t) => (
        <button key={t.s} type="button" onClick={() => zuSchritt(t.s)}
          className="rounded-lg bg-sand px-2 py-0.5 text-[11px] text-ink-muted
                     transition hover:text-ink">
          {t.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Eine Antwortkachel mit ihrer Zifferntaste.
 *
 * Die Nummer ist nicht Deko: sie ist der Grund, warum der geführte Ablauf
 * schneller sein kann als das alte Formular. Wer die Reihenfolge im Kopf
 * hat, tippt einen ganzen Trade blind durch.
 */
function Kachel({
  nummer, option, aktiv, onClick,
}: { nummer: number; option: Option; aktiv: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        "group flex min-w-[8.5rem] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left",
        "transition duration-150 ease-tactile active:scale-[0.97]",
        aktiv
          ? "border-accent bg-accent-tint text-ink"
          : "border-line bg-sand text-ink-soft hover:border-line-strong hover:text-ink",
      )}>
      <span className={cx(
        "num flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px]",
        aktiv ? "bg-accent text-ink-on" : "bg-field text-ink-faint group-hover:text-ink-muted",
      )}>
        {nummer <= 9 ? nummer : "·"}
      </span>
      <span className="text-sm leading-tight">
        {option.label}
        {option.hinweis && (
          <span className="block text-[10.5px] text-ink-faint">{option.hinweis}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Die letzte Seite: alles auf einen Blick, jede Zeile ein Rücksprung.
 *
 * Ohne sie wäre ein falscher Klick in Schritt zwei erst Wochen später in der
 * Auswertung aufgefallen — und dort nicht mehr als Fehler erkennbar.
 */
function Uebersicht({
  entwurf, kategorien, datumLesbar, rWert, verlaufsFeld, label, labelListe, zuSchritt, schritte,
}: {
  entwurf: Entwurf;
  kategorien: { gvaTyp: BacktestCategory | null; skipGrund: BacktestCategory | null;
    confluence: BacktestCategory | null; anmerkung: BacktestCategory | null };
  datumLesbar: string; rWert: string;
  verlaufsFeld: "gegenlauf" | "vorlauf" | null;
  label: (k: BacktestCategory | null, id: string) => string;
  labelListe: (k: BacktestCategory | null, ids: string[]) => string;
  zuSchritt: (s: Schritt) => void;
  schritte: Schritt[];
}) {
  const zeilen: { s: Schritt; k: string; v: string }[] = [
    { s: "datum", k: "Datum", v: datumLesbar },
    { s: "richtung", k: "Richtung", v: entwurf.direction === "long" ? "Long" : entwurf.direction === "short" ? "Short" : "—" },
  ];
  if (schritte.includes("gva")) {
    zeilen.push({ s: "gva", k: "GVA-Typ", v: entwurf.gvaTypId ? label(kategorien.gvaTyp, entwurf.gvaTypId) : "keine Angabe" });
  }
  zeilen.push({
    s: "ergebnis", k: "Ergebnis",
    v: entwurf.result === "" ? "—" : RESULT_LABEL[entwurf.result],
  });
  if (schritte.includes("skipgrund")) {
    zeilen.push({ s: "skipgrund", k: "Skip-Grund", v: label(kategorien.skipGrund, entwurf.skipGrundId) });
  }
  if (schritte.includes("rr")) {
    zeilen.push({ s: "rr", k: "RR geplant → R", v: `${entwurf.rr || "—"} → ${rWert || "—"} R${entwurf.rManuell.trim() !== "" ? " (von Hand)" : ""}` });
  } else if (entwurf.result !== "skip" && entwurf.result !== "") {
    zeilen.push({ s: "ergebnis", k: "R", v: `${rWert} R (fix)` });
  }
  if (verlaufsFeld && schritte.includes("verlauf")) {
    const lab: Record<string, string> = verlaufsFeld === "gegenlauf" ? GEGENLAUF_LABEL : VORLAUF_LABEL;
    zeilen.push({
      s: "verlauf",
      k: verlaufsFeld === "gegenlauf" ? "Gegenlauf" : "Vorlauf",
      v: entwurf.verlauf ? lab[entwurf.verlauf] : "—",
    });
  }
  if (schritte.includes("confluence")) {
    zeilen.push({ s: "confluence", k: "Confluence", v: labelListe(kategorien.confluence, entwurf.confluence) });
  }
  if (schritte.includes("anmerkung")) {
    zeilen.push({ s: "anmerkung", k: "Anmerkung", v: labelListe(kategorien.anmerkung, entwurf.anmerkung) });
  }
  if (entwurf.notiz.trim()) {
    zeilen.push({ s: schritte.includes("learning") ? "learning" : "abschluss", k: entwurf.result === "sl" ? "Learning" : "Notiz", v: entwurf.notiz });
  }
  if (entwurf.link.trim()) zeilen.push({ s: "abschluss", k: "Chart", v: entwurf.link });

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {zeilen.map((z, i) => (
        <button key={`${z.k}-${i}`} type="button" onClick={() => zuSchritt(z.s)}
          className={cx(
            "flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm transition hover:bg-sand",
            i > 0 && "border-t border-line",
          )}>
          <span className="w-32 shrink-0 text-xs text-ink-muted">{z.k}</span>
          <span className="min-w-0 flex-1 truncate text-ink">{z.v}</span>
          <span className="text-[10px] text-ink-faint">ändern</span>
        </button>
      ))}
    </div>
  );
}
