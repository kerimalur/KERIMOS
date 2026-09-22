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
  id: string;
  pair: string;
  direction: "long" | "short";
  date: string;
  status: string;
  result: Ergebnis | null;
  rMultiple: number;
  riskAmount: number | null;
  accountBalance: number | null;
  profitAmount: number | null;
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

  const startProzent = trade.profitAmount !== null && trade.accountBalance
    ? String(runde((trade.profitAmount / trade.accountBalance) * 100)) : "";

  const [ergebnis, setErgebnis] = useState<Ergebnis | "">(trade.result ?? "");
  const [kontostand, setKontostand] = useState(
    trade.accountBalance !== null ? String(trade.accountBalance) : "");
  const [prozent, setProzent] = useState(startProzent);
  // Entweder Prozent aufs Konto oder direkt der Betrag in Franken. Vorbelegt
  // ist Prozent, wenn ein Kontostand bekannt ist — sonst geht es nur in CHF.
  const [art, setArt] = useState<"prozent" | "franken">(
    trade.accountBalance ? "prozent" : "franken");
  const [franken, setFranken] = useState(
    trade.profitAmount !== null ? String(trade.profitAmount) : "");
  const [risiko, setRisiko] = useState(
    trade.riskAmount !== null ? String(trade.riskAmount) : "");

  const k = zahl(kontostand);
  const p = zahl(prozent);
  const f = zahl(franken);
  const betrag = art === "franken"
    ? f
    : p !== null && k !== null && k > 0 ? runde((k * p) / 100) : trade.profitAmount;
  // Die jeweils andere Grösse zur Anzeige.
  const prozentGerechnet = art === "franken" && f !== null && k !== null && k > 0
    ? runde((f / k) * 100) : null;
  const rz = zahl(risiko);
  const rGerechnet = ergebnis === "breakeven" ? 0
    : rz !== null && rz > 0 && betrag !== null ? runde(betrag / rz) : null;

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
        {trade.profitAmount !== null && (
          <input type="hidden" name="profitAmount" value={String(trade.profitAmount)} />
        )}

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
          <input type="hidden" name="eingabe" value={art} />
          <div className="mb-3 inline-flex rounded-xl bg-sand p-1">
            {([["prozent", "in %"], ["franken", "in CHF"]] as const).map(([wert, label]) => (
              <button key={wert} type="button" onClick={() => setArt(wert)}
                className={cx("rounded-lg px-3.5 py-1 text-sm font-medium transition",
                  art === wert ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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
            {art === "prozent" ? (
              <div>
                <Label htmlFor="tj-prozent">Gewinn / Verlust in %</Label>
                <Input id="tj-prozent" name="prozent" inputMode="decimal"
                  value={prozent} onChange={(e) => setProzent(e.target.value)}
                  placeholder="z.B. 2.4 oder -1" />
              </div>
            ) : (
              <div>
                <Label htmlFor="tj-franken">Gewinn / Verlust in CHF</Label>
                <Input id="tj-franken" name="franken" inputMode="decimal"
                  value={franken} onChange={(e) => setFranken(e.target.value)}
                  placeholder="z.B. 240 oder -100" />
              </div>
            )}
            <div>
              <Label htmlFor="tj-balance">
                Kontostand beim Einstieg{art === "franken" && " (optional)"}
              </Label>
              <Input id="tj-balance" name="accountBalance" inputMode="decimal"
                value={kontostand} onChange={(e) => setKontostand(e.target.value)}
                placeholder="z.B. 10000" />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-sand/60 px-3 py-2">
              {art === "prozent" ? (
                <>
                  <p className="text-[11px] text-ink-faint">Betrag (gerechnet)</p>
                  <p className={cx("tabular text-base font-medium",
                    betrag !== null && betrag > 0 ? "text-good-bright"
                      : betrag !== null && betrag < 0 ? "text-bad-bright" : "text-ink")}>
                    {betrag === null ? "—" : `${betrag > 0 ? "+" : ""}${betrag.toFixed(2)} CHF`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-ink-faint">Aufs Konto (gerechnet)</p>
                  <p className={cx("tabular text-base font-medium",
                    prozentGerechnet !== null && prozentGerechnet > 0 ? "text-good-bright"
                      : prozentGerechnet !== null && prozentGerechnet < 0 ? "text-bad-bright"
                        : "text-ink")}>
                    {prozentGerechnet === null ? "— (Kontostand fehlt)"
                      : `${prozentGerechnet > 0 ? "+" : ""}${prozentGerechnet.toFixed(2)} %`}
                  </p>
                </>
              )}
            </div>
            <div>
              <Label htmlFor="tj-risk">Risiko in CHF (für das R)</Label>
              <Input id="tj-risk" name="riskAmount" inputMode="decimal"
                value={risiko} onChange={(e) => setRisiko(e.target.value)}
                placeholder="z.B. 100" />
            </div>
            <div>
              <Label htmlFor="tj-r">R</Label>
              {rGerechnet !== null ? (
                <p className="tabular rounded-xl bg-sand/60 px-3 py-2 text-sm text-ink">
                  {rGerechnet > 0 ? "+" : ""}{rGerechnet.toFixed(2)} R
                  <span className="ml-1 text-[11px] text-ink-faint">gerechnet</span>
                </p>
              ) : (
                <Input id="tj-r" name="rMultiple" inputMode="decimal"
                  defaultValue={trade.rMultiple ? String(Math.abs(trade.rMultiple)) : ""}
                  placeholder="ohne Risiko von Hand" />
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Prozent oder Franken — eins reicht. Bei Prozent rechnet das System
            den Betrag aus dem Kontostand. Der Wert der Brücke wird ersetzt;
            mit Risiko folgt auch das R.
          </p>
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
