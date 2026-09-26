"use client";
import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import {
  fortschritt, wochenReihe, TAGE_BIS_GEWOHNHEIT, type Ersatz,
} from "@/lib/ersatz/typen";
import {
  ersatzAnlegen, ersatzAendern, ersatzLoeschen, ersetztGezaehlt, ersetztZuruecknehmen,
} from "@/lib/ersatz/actions";

/**
 * Ersetzen statt verbieten — schlechte Gewohnheiten durch gute umleiten.
 *
 * Jede Karte ist ein Wenn-dann-Plan. Der grosse Knopf zählt, wenn der
 * Ersatz geklappt hat. Rückfälle werden nirgends erfasst — mit Absicht
 * (siehe lib/ersatz/typen.ts).
 */
export function ErsatzBereich({ liste, heute }: { liste: Ersatz[]; heute: string }) {
  const aktiv = liste.filter((e) => e.aktiv);
  const pausiert = liste.filter((e) => !e.aktiv);

  return (
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="font-display text-xl font-bold text-ink">Ersetzen statt verbieten</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-ink-muted">
          Eine schlechte Gewohnheit streichen endet oft im Jojo. Hier bekommt sie einen Ersatz:
          der Auslöser bleibt, aber was danach passiert, legst du fest. Gezählt wird nur,
          wenn es geklappt hat — die alte Gewohnheit verliert sich mit der Zeit von selbst.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {aktiv.map((e) => <ErsatzKarte key={e.id} e={e} heute={heute} />)}
        <NeuerErsatz erster={liste.length === 0} />
      </div>

      {pausiert.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-ink-muted">Pausiert ({pausiert.length})</summary>
          <div className="mt-3 grid gap-4 opacity-70 lg:grid-cols-2">
            {pausiert.map((e) => <ErsatzKarte key={e.id} e={e} heute={heute} />)}
          </div>
        </details>
      )}
    </section>
  );
}

function ErsatzKarte({ e, heute }: { e: Ersatz; heute: string }) {
  const [laeuft, start] = useTransition();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const f = fortschritt(e, heute);
  const reihe = wochenReihe(e.erfolge, heute, 8);
  const maxWoche = Math.max(1, ...reihe.map((w) => w.anzahl));
  const heuteAnzahl = e.erfolge.filter((d) => d === heute).length;

  if (bearbeiten) {
    return (
      <ErsatzFormular
        start={e}
        titel="Plan bearbeiten"
        abbrechen={() => setBearbeiten(false)}
        speichern={async (w) => {
          const r = await ersatzAendern(e.id, w);
          if (!r) setBearbeiten(false);
          return r;
        }}
        extra={
          <div className="flex flex-wrap gap-2 border-t border-line/70 pt-3">
            <button type="button" onClick={() => start(async () => { setFehler(await ersatzAendern(e.id, { aktiv: !e.aktiv })); setBearbeiten(false); })}
              className="rounded-lg border border-line bg-sand px-3 py-1.5 text-xs text-ink-soft">
              {e.aktiv ? "Pausieren" : "Wieder aufnehmen"}
            </button>
            <button type="button"
              onClick={() => { if (confirm("Diesen Plan samt allen Erfolgen löschen?")) start(async () => { setFehler(await ersatzLoeschen(e.id)); }); }}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-bad-bright hover:bg-bad-tint">
              Löschen
            </button>
          </div>
        }
      />
    );
  }

  return (
    <div className={cx("rounded-2xl border border-line/70 bg-card p-5 shadow-card transition", laeuft && "opacity-70")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-ink-soft">
            <span className="text-ink-muted">Wenn</span> {e.ausloeser || "…"}
          </p>
          <p className="mt-1 font-display text-lg font-bold leading-snug text-ink">
            <span className="text-accent-soft">dann</span> {e.ersatz}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            statt <span className="line-through">{e.gewohnheit}</span>
            {e.bedeutung && <> · gibt dir: {e.bedeutung}</>}
          </p>
        </div>
        <button type="button" onClick={() => setBearbeiten(true)}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-ink-faint hover:bg-sand hover:text-ink-soft">
          bearbeiten
        </button>
      </div>

      {e.aktiv && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={laeuft}
            onClick={() => start(async () => setFehler(await ersetztGezaehlt(e.id)))}
            className="rounded-xl bg-good px-4 py-2.5 text-sm font-semibold text-ink-on shadow-card
                       transition active:scale-[0.97] disabled:opacity-50">
            ✓ Hat geklappt
          </button>
          {heuteAnzahl > 0 && (
            <span className="text-xs text-good-bright">
              heute {heuteAnzahl}×
              <button type="button" onClick={() => start(async () => setFehler(await ersetztZuruecknehmen(e.id)))}
                className="ml-2 text-ink-faint underline-offset-2 hover:underline">rückgängig</button>
            </span>
          )}
        </div>
      )}

      {/* Weg zur neuen Gewohnheit: Erfolgstage gegen die ~66 Tage. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-ink-muted">{f.phaseText}</span>
          <span className="tabular text-ink-faint">{f.erfolgsTage} / ~{TAGE_BIS_GEWOHNHEIT} Tage</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-good transition-all" style={{ width: `${Math.round(f.anteil * 100)}%` }} />
        </div>
      </div>

      {/* Die letzten acht Wochen: steigt die Zahl, übernimmt der Ersatz. */}
      <div className="mt-4">
        <div className="flex items-end gap-1.5" style={{ height: 44 }}>
          {reihe.map((w, i) => (
            <div key={w.woche} className="flex flex-1 flex-col items-center justify-end" title={`Woche ab ${w.woche}: ${w.anzahl}×`}>
              <div className={cx("w-full rounded-t-[4px]", i === reihe.length - 1 ? "bg-good" : "bg-good/45")}
                style={{ height: `${w.anzahl === 0 ? 2 : Math.max(6, (w.anzahl / maxWoche) * 40)}px`,
                  opacity: w.anzahl === 0 ? 0.35 : 1 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
          <span>vor 8 Wochen</span>
          <span>
            {f.gesamt}× insgesamt
            {f.trend === "hoch" && <span className="ml-1.5 text-good-bright">▲ mehr als vorher</span>}
            {f.trend === "runter" && <span className="ml-1.5 text-accent">▼ weniger als vorher — Auslöser nochmal anschauen?</span>}
          </span>
          <span>diese Woche</span>
        </div>
      </div>
      {fehler && <p className="mt-2 text-xs text-bad-bright">{fehler}</p>}
    </div>
  );
}

type Werte = { gewohnheit: string; ausloeser: string; bedeutung: string; ersatz: string };

function ErsatzFormular({ start, titel, speichern, abbrechen, extra }: {
  start?: Partial<Werte>; titel: string;
  speichern: (w: Werte) => Promise<string | null>;
  abbrechen?: () => void; extra?: React.ReactNode;
}) {
  const [w, setW] = useState<Werte>({
    gewohnheit: start?.gewohnheit ?? "", ausloeser: start?.ausloeser ?? "",
    bedeutung: start?.bedeutung ?? "", ersatz: start?.ersatz ?? "",
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, go] = useTransition();
  const feld = (k: keyof Werte, label: string, platz: string, hinweis?: string) => (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <input value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} placeholder={platz}
        className="mt-1 w-full rounded-lg border border-line bg-field px-3 py-2 text-sm text-ink outline-none
                   placeholder:text-ink-faint focus:border-accent" />
      {hinweis && <span className="mt-0.5 block text-[10px] text-ink-faint">{hinweis}</span>}
    </label>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-line-strong bg-card p-5 shadow-card">
      <p className="font-display text-base font-bold text-ink">{titel}</p>
      {feld("gewohnheit", "1 · Was willst du loswerden?", "z.B. am Handy scrollen")}
      {feld("ausloeser", "2 · Wann passiert es? — Wenn …", "z.B. mir nach der Schicht langweilig ist",
        "Der Auslöser: Uhrzeit, Ort, Gefühl oder was davor passiert.")}
      {feld("bedeutung", "3 · Was gibt sie dir?", "z.B. Abschalten, Belohnung, Ablenkung",
        "Der Ersatz sollte dasselbe geben — sonst holt sich der Kopf die alte Gewohnheit zurück.")}
      {feld("ersatz", "4 · Was machst du stattdessen? — dann …", "z.B. 10 Backtest-Trades oder 20 Min raus",
        "Klein und sofort machbar. Lieber zu leicht als zu schwer.")}
      <div className="flex gap-2">
        <button type="button" disabled={laeuft || !w.gewohnheit.trim() || !w.ersatz.trim()}
          onClick={() => go(async () => {
            const r = await speichern(w);
            setFehler(r);
            if (!r && !start) setW({ gewohnheit: "", ausloeser: "", bedeutung: "", ersatz: "" });
          })}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink-on disabled:opacity-40">
          Speichern
        </button>
        {abbrechen && (
          <button type="button" onClick={abbrechen} className="rounded-lg bg-sand px-4 py-2 text-sm text-ink-soft">
            Abbrechen
          </button>
        )}
      </div>
      {fehler && <p className="text-xs text-bad-bright">{fehler}</p>}
      {extra}
    </div>
  );
}

function NeuerErsatz({ erster }: { erster: boolean }) {
  const [auf, setAuf] = useState(erster);
  if (!auf) {
    return (
      <button type="button" onClick={() => setAuf(true)}
        className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-line-strong
                   text-sm text-ink-muted transition hover:border-accent hover:text-accent-soft">
        + Neuen Ersatz planen
      </button>
    );
  }
  return (
    <ErsatzFormular titel="Neuer Ersatz"
      speichern={async (w) => { const r = await ersatzAnlegen(w); if (!r && !erster) setAuf(false); return r; }}
      abbrechen={erster ? undefined : () => setAuf(false)} />
  );
}
