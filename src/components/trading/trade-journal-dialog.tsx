"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tradeJournalSpeichern, lageNachtragen } from "@/lib/journal-actions";
import {
  FRAGEN, LEARNING_KEY, fragGilt, type Antworten,
} from "@/lib/trading/journal-fragen";
import type { LageSnapshot } from "@/lib/trading/lage-snapshot";
import { Modal, ModalKopf } from "@/components/trading/modal";
import { LageAnzeige } from "@/components/trading/lage-anzeige";
import { Badge, Button, Input, Label, Select, cx } from "@/components/ui";

type Ergebnis = "win" | "loss" | "breakeven";

export interface DialogTrade {
  /** Kontostand vor diesem Trade, aus der Kontokette. Null ohne Konto. */
  standVor?: number | null;
  gewinnProzent?: number | null;
  risikoProzent?: number | null;
  rQuelle?: "gerechnet" | "gespeichert";
  id: string;
  pair: string;
  direction: "long" | "short";
  date: string;
  status: string;
  result: Ergebnis | null;
  rMultiple: number;
  riskAmount: number | null;
  riskPercent: number | null;
  accountBalance: number | null;
  profitAmount: number | null;
  profitPercent: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  lotSize: number | null;
  notes: string;
  confluences: string[];
  antworten: Antworten;
  fundamentalSnapshot: LageSnapshot | null;
}

const zahl = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
};

const runde = (n: number, stellen = 2) => {
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
};

/**
 * „bearbeiten" im Journal — als Dialog über der Liste.
 *
 * Bis 22.09.2026 setzte der Link nur `?bearbeiten=` in die Adresse und
 * füllte das Formular oben auf der Seite. Das Formular ist eine
 * Client-Komponente, die ihre Werte beim ersten Rendern übernimmt — bei einem
 * Klick in der Liste blieb es deshalb leer oder zugeklappt, weit oben
 * ausserhalb des Blickfelds. Es sah aus, als passiere nichts. Jetzt öffnet
 * der Knopf den Dialog genau dort, wo man geklickt hat.
 *
 * Der Dialog schreibt nur seine eigenen Felder (siehe tradeJournalSpeichern)
 * — Preise, Lots und Status der Brücke bleiben unangetastet.
 */
export function TradeBearbeiten({
  trade, konfluenzen, startOffen = false, bilder = null,
}: {
  trade: DialogTrade;
  konfluenzen: readonly string[];
  /** Direkt offen — nach einem Bild-Upload, der mit `?bearbeiten=` zurückkommt. */
  startOffen?: boolean;
  /** Screenshot-Bereich, auf dem Server gerendert (eigene Formulare). */
  bilder?: React.ReactNode;
}) {
  const [offen, setOffen] = useState(startOffen);
  return (
    <>
      <button type="button" onClick={() => setOffen(true)}
        title="Ergebnis, Notizen, Fragen und Fundamentallage"
        className="rounded-lg px-1.5 text-xs text-ink-faint transition hover:text-accent-soft">
        bearbeiten
      </button>
      {offen && (
        <Dialog trade={trade} konfluenzen={konfluenzen} bilder={bilder}
          schliessen={() => setOffen(false)} />
      )}
    </>
  );
}

/** Zwei kleine Knöpfe: dieselbe Zahl in % oder in CHF. */
function Umschalter({ wert, setzen, name }: {
  wert: "prozent" | "franken";
  setzen: (w: "prozent" | "franken") => void;
  name: string;
}) {
  return (
    <>
      <input type="hidden" name={name} value={wert} />
      <span className="inline-flex rounded-lg bg-sand p-0.5">
        {([["prozent", "%"], ["franken", "CHF"]] as const).map(([w, label]) => (
          <button key={w} type="button" onClick={() => setzen(w)}
            className={cx("rounded-md px-2 py-0.5 text-[11px] font-medium transition",
              wert === w ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
            {label}
          </button>
        ))}
      </span>
    </>
  );
}

function Dialog({
  trade, konfluenzen, bilder, schliessen,
}: {
  trade: DialogTrade;
  konfluenzen: readonly string[];
  bilder: React.ReactNode;
  schliessen: () => void;
}) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<{ art: "fehler" | "hinweis"; text: string } | null>(null);

  const standVor = trade.standVor ?? trade.accountBalance ?? null;

  // Vorbelegung: was schon erfasst ist, in der Einheit, in der es erfasst wurde.
  const [art, setArt] = useState<"prozent" | "franken">(
    trade.profitAmount !== null && trade.profitPercent == null ? "franken" : "prozent");
  const [prozent, setProzent] = useState(
    trade.profitPercent != null ? String(trade.profitPercent)
      : trade.gewinnProzent != null && trade.profitAmount === null
        ? String(trade.gewinnProzent) : "");
  const [franken, setFranken] = useState(
    trade.profitAmount !== null ? String(trade.profitAmount) : "");

  const [risikoArt, setRisikoArt] = useState<"prozent" | "franken">(
    trade.riskAmount !== null && trade.riskPercent == null ? "franken" : "prozent");
  const [risikoProzent, setRisikoProzent] = useState(
    trade.riskPercent != null ? String(trade.riskPercent) : "");
  const [risikoFranken, setRisikoFranken] = useState(
    trade.riskAmount !== null ? String(trade.riskAmount) : "");

  const [ergebnis, setErgebnis] = useState<Ergebnis | "">(trade.result ?? "");

  const ausProzent = (p: string) => {
    const x = zahl(p);
    return x !== null && standVor !== null && standVor > 0 ? runde((standVor * x) / 100) : null;
  };

  // Gewinn und Risiko in Franken — egal, in welcher Einheit sie erfasst sind.
  const betrag = art === "franken" ? zahl(franken) : ausProzent(prozent);
  const risiko = risikoArt === "franken" ? zahl(risikoFranken) : ausProzent(risikoProzent);

  // Die jeweils andere Grösse zur Anzeige.
  const betragProzent = art === "franken" && betrag !== null && standVor
    ? runde((betrag / standVor) * 100) : zahl(prozent);
  const risikoInFranken = risiko;

  const rGerechnet = ergebnis === "breakeven" ? 0
    : risiko !== null && risiko > 0 && betrag !== null ? runde(betrag / risiko) : null;

  // Die Fragen hängen vom Ergebnis ab. Ohne gewähltes Ergebnis zählt das
  // Vorzeichen des Betrags — genau wie beim Speichern.
  const ergebnisFuerFragen: Ergebnis | null = ergebnis
    || (betrag === null ? null : betrag > 0 ? "win" : betrag < 0 ? "loss" : "breakeven");

  const nachkomma = trade.pair.includes("JPY") ? 3 : 5;

  const speichern = (fd: FormData) => {
    setMeldung(null);
    starte(async () => {
      const antwort = await tradeJournalSpeichern(fd);
      if (antwort.fehler) { setMeldung({ art: "fehler", text: antwort.fehler }); return; }
      router.refresh();
      if (antwort.hinweis) setMeldung({ art: "hinweis", text: antwort.hinweis });
      else schliessen();
    });
  };

  const lageHolen = () => {
    setMeldung(null);
    const fd = new FormData();
    fd.set("id", trade.id);
    starte(async () => {
      const { fehler } = await lageNachtragen(fd);
      if (fehler) setMeldung({ art: "fehler", text: fehler });
      router.refresh();
    });
  };

  return (
    <Modal offen schliessen={schliessen} breite="max-w-2xl">
      <ModalKopf schliessen={schliessen}>
        <span className="font-display text-lg font-bold text-ink">{trade.pair}</span>
        <Badge tone={trade.direction === "long" ? "good" : "bad"}>
          {trade.direction === "long" ? "Long" : "Short"}
        </Badge>
        <span className="text-xs text-ink-muted">
          {trade.date.slice(8, 10)}.{trade.date.slice(5, 7)}.{trade.date.slice(0, 4)}
        </span>
        {trade.status === "open" && <Badge tone="warn">läuft</Badge>}
      </ModalKopf>

      <form action={speichern} className="space-y-6 px-5 py-5">
        <input type="hidden" name="id" value={trade.id} />
        {(trade.entryPrice !== null || trade.lotSize !== null) && (
          <p className="text-xs text-ink-faint">
            Von der Brücke:
            {trade.entryPrice !== null && ` Einstieg ${trade.entryPrice.toFixed(nachkomma)}`}
            {trade.exitPrice !== null && ` · Ausstieg ${trade.exitPrice.toFixed(nachkomma)}`}
            {trade.lotSize !== null && ` · ${trade.lotSize} Lot`}
            {trade.profitAmount !== null && ` · Betrag ${trade.profitAmount.toFixed(2)}`}
          </p>
        )}

        {/* ------------------------------------------------------- Ergebnis */}
        <section>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Ergebnis
          </h3>

          {/* Der Kontostand vor dem Trade kommt aus der Kontokette und wird
              nicht mehr eingetippt: Startkapital, Ein- und Auszahlungen und
              alle früheren Trades ergeben ihn. Korrigierst du einen alten
              Trade, verschiebt sich dieser Wert hier automatisch mit. */}
          <p className="mb-3 text-xs text-ink-muted">
            Kontostand vor diesem Trade:{" "}
            <strong className="tabular text-ink">
              {standVor === null ? "unbekannt" : `${standVor.toFixed(2)} CHF`}
            </strong>
            {standVor === null && " — lege unter Konten ein Startkapital an, dann rechnet alles."}
          </p>
          <input type="hidden" name="standVor" value={standVor === null ? "" : String(standVor)} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tj-result">Ausgang</Label>
              <Select id="tj-result" name="result" value={ergebnis}
                onChange={(e) => setErgebnis(e.target.value as Ergebnis | "")}>
                <option value="">aus dem Betrag</option>
                <option value="win">Gewinn</option>
                <option value="loss">Verlust</option>
                <option value="breakeven">Breakeven</option>
              </Select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0" htmlFor="tj-gewinn">Gewinn / Verlust</Label>
                <Umschalter wert={art} setzen={setArt} name="eingabe" />
              </div>
              {art === "prozent" ? (
                <Input id="tj-gewinn" name="prozent" inputMode="decimal"
                  value={prozent} onChange={(e) => setProzent(e.target.value)}
                  placeholder="z.B. 2.4 oder -1" />
              ) : (
                <Input id="tj-gewinn" name="franken" inputMode="decimal"
                  value={franken} onChange={(e) => setFranken(e.target.value)}
                  placeholder="z.B. 240 oder -100" />
              )}
              <p className="mt-1 text-[11px] text-ink-faint">
                {art === "prozent"
                  ? betrag === null ? "Betrag: — (Kontostand fehlt)"
                    : `Betrag: ${betrag > 0 ? "+" : ""}${betrag.toFixed(2)} CHF`
                  : betragProzent === null ? "Aufs Konto: — (Kontostand fehlt)"
                    : `Aufs Konto: ${betragProzent > 0 ? "+" : ""}${betragProzent.toFixed(2)} %`}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0" htmlFor="tj-risiko">Risiko</Label>
                <Umschalter wert={risikoArt} setzen={setRisikoArt} name="risikoArt" />
              </div>
              {risikoArt === "prozent" ? (
                <Input id="tj-risiko" name="riskPercent" inputMode="decimal"
                  value={risikoProzent} onChange={(e) => setRisikoProzent(e.target.value)}
                  placeholder="z.B. 1" />
              ) : (
                <Input id="tj-risiko" name="riskAmount" inputMode="decimal"
                  value={risikoFranken} onChange={(e) => setRisikoFranken(e.target.value)}
                  placeholder="z.B. 100" />
              )}
              <p className="mt-1 text-[11px] text-ink-faint">
                {risikoInFranken === null
                  ? "Risikobetrag: — (Prozent brauchen den Kontostand)"
                  : `Risikobetrag: ${risikoInFranken.toFixed(2)} CHF`}
              </p>
            </div>

            <div>
              <Label htmlFor="tj-r">R</Label>
              {rGerechnet !== null ? (
                <p className={cx("tabular rounded-xl bg-sand/60 px-3 py-2 text-base font-medium",
                  rGerechnet > 0 ? "text-good-bright"
                    : rGerechnet < 0 ? "text-bad-bright" : "text-ink")}>
                  {rGerechnet > 0 ? "+" : ""}{rGerechnet.toFixed(2)} R
                  <span className="ml-1 text-[11px] font-normal text-ink-faint">
                    Gewinn ÷ Risiko
                  </span>
                </p>
              ) : (
                <>
                  <Input id="tj-r" name="rMultiple" inputMode="decimal"
                    defaultValue={trade.rMultiple ? String(Math.abs(trade.rMultiple)) : ""}
                    placeholder="von Hand" />
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Sobald Gewinn und Risiko dastehen, rechnet das System das R selbst.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Notizen */}
        <section>
          <Label htmlFor="tj-notes">Notizen</Label>
          <textarea id="tj-notes" name="notes" rows={4} defaultValue={trade.notes}
            placeholder="Was hast du gesehen, warum eingestiegen, wie lief es?"
            className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink
                       placeholder:text-ink-faint outline-none focus:border-accent" />
        </section>

        {/* ---------------------------------------------------- Konfluenzen */}
        {konfluenzen.length > 0 && (
          <section>
            <p className="mb-1.5 text-xs text-ink-muted">Konfluenzen</p>
            <div className="flex flex-wrap gap-1.5">
              {konfluenzen.map((c) => (
                <label key={c} className="cursor-pointer">
                  <input type="checkbox" name="confluences" value={c}
                    defaultChecked={trade.confluences.includes(c)} className="peer sr-only" />
                  <span className="block rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                                   text-ink-muted transition peer-checked:border-accent
                                   peer-checked:bg-accent-tint peer-checked:text-accent-soft">
                    {c}
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- Fragen */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Fragen zum Trade
          </h3>
          {FRAGEN.filter((f) => fragGilt(f, ergebnisFuerFragen)).map((f) => (
            <div key={f.key}>
              <p className="mb-1.5 text-sm text-ink-soft">{f.frage}</p>
              <div className="flex flex-wrap gap-1.5">
                {f.optionen.map((o) => (
                  <label key={o.wert} className="cursor-pointer">
                    <input type="radio" name={`frage_${f.key}`} value={o.wert}
                      defaultChecked={trade.antworten[f.key] === o.wert}
                      className="peer sr-only" />
                    <span className="block rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                                     text-ink-muted transition peer-checked:border-accent
                                     peer-checked:bg-accent-tint peer-checked:text-accent-soft">
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div>
            <Label htmlFor="tj-learning">
              {ergebnisFuerFragen === "loss" ? "Woran lag der Verlust? (Learning)" : "Learning"}
            </Label>
            <textarea id="tj-learning" name={LEARNING_KEY} rows={2}
              defaultValue={trade.antworten[LEARNING_KEY] ?? ""}
              placeholder="Ein Satz, den du beim nächsten Trade wissen willst."
              className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink
                         placeholder:text-ink-faint outline-none focus:border-accent" />
          </div>
        </section>

        {meldung && (
          <p className={cx("rounded-xl border px-3 py-2 text-xs",
            meldung.art === "fehler"
              ? "border-bad/40 bg-bad-tint text-ink-soft"
              : "border-warn/40 bg-warn-tint text-ink-soft")}>
            {meldung.text}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={schliessen}>Abbrechen</Button>
          <Button type="submit" disabled={laeuft}>{laeuft ? "Speichert …" : "Speichern"}</Button>
        </div>
      </form>

      {/* Ausserhalb des Formulars: Lage und Bilder haben eigene Aktionen,
          und verschachtelte Formulare gibt es in HTML nicht. */}
      <div className="space-y-5 border-t border-line/70 px-5 py-5">
        <section>
          <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Fundamentallage
          </h3>
          {trade.fundamentalSnapshot ? (
            <LageAnzeige s={trade.fundamentalSnapshot} />
          ) : (
            <div className="rounded-xl bg-sand/50 px-3 py-3 text-xs text-ink-muted">
              <p>
                Für diesen Trade ist keine Lage festgehalten. Neue Live-Trades
                bekommen sie automatisch kurz nach dem Einstieg. Nachtragen geht,
                zeigt dann aber die Lage von heute.
              </p>
              <Button type="button" variant="ghost" className="mt-2.5" disabled={laeuft}
                onClick={lageHolen}>
                {laeuft ? "Rechnet …" : "Lage von heute festhalten"}
              </Button>
            </div>
          )}
        </section>

        {bilder}
      </div>
    </Modal>
  );
}
