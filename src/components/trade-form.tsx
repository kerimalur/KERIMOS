"use client";

import { useState } from "react";
import { tradeSpeichern, tradeLoeschen } from "@/lib/journal-actions";
import { Card, CardTitle, Button, Input, Select, Label, Badge, cx } from "./ui";

/**
 * Erfassung eines Trades.
 *
 * Aufgeklappt statt Modal: Kerim erfasst im Backtest acht Trades am Stück.
 * Ein Dialog, der sich nach jedem Eintrag schliesst und neu geöffnet werden
 * muss, kostet bei 24 Trades pro Woche mehr Zeit als das Formular Platz.
 *
 * Nach dem Speichern bleibt das Formular offen und behält Paar, Richtung und
 * Datum — beim Durchspielen einer Woche ändert sich meist nur das Ergebnis.
 */

export interface TradeVorgabe {
  id?: string;
  pair?: string;
  direction?: "long" | "short";
  date?: string;
  result?: string;
  rMultiple?: number;
  sessionType?: "live" | "backtest";
  session?: string;
  notes?: string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  setups?: Record<string, boolean>;
}

const SETUP_FELDER = [
  { key: "dreiTagesGva", label: "3-Tages-GVA" },
  { key: "weeklyGva", label: "Wochen-GVA" },
  { key: "dailyBos", label: "Daily BOS" },
  { key: "valueArea", label: "Value Area" },
  { key: "marketStructure", label: "Market Structure" },
];

export function TradeForm({
  paare, sessions, strategien, konfluenzen, vorgabe, offenStart = false,
}: {
  paare: readonly string[];
  sessions: readonly string[];
  strategien: { id: string; name: string }[];
  konfluenzen: readonly string[];
  vorgabe?: TradeVorgabe;
  offenStart?: boolean;
}) {
  const [offen, setOffen] = useState(offenStart || Boolean(vorgabe?.id));
  const [ergebnis, setErgebnis] = useState(vorgabe?.result ?? "win");
  const bearbeiten = Boolean(vorgabe?.id);

  const heute = new Date().toISOString().slice(0, 10);

  if (!offen) {
    return (
      <Card flat className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold text-ink">Trade erfassen</div>
          <p className="text-xs text-ink-muted">
            Bleibt nach dem Speichern offen — für mehrere Trades am Stück.
          </p>
        </div>
        <Button onClick={() => setOffen(true)}>Formular öffnen</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">
          {bearbeiten ? "Trade bearbeiten" : "Trade erfassen"}
        </CardTitle>
        {!bearbeiten && (
          <button type="button" onClick={() => setOffen(false)}
            className="text-xs text-ink-faint transition hover:text-ink-muted">
            zuklappen
          </button>
        )}
      </div>

      <form action={tradeSpeichern} className="space-y-4">
        {vorgabe?.id && <input type="hidden" name="id" value={vorgabe.id} />}

        {/* Zeile 1: was, wann, wohin */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="tf-pair">Paar</Label>
            <Select id="tf-pair" name="pair" defaultValue={vorgabe?.pair ?? "EURUSD"} required>
              {paare.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tf-direction">Richtung</Label>
            <Select id="tf-direction" name="direction" defaultValue={vorgabe?.direction ?? "long"}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="tf-date">Datum</Label>
            <Input id="tf-date" name="date" type="date"
              defaultValue={vorgabe?.date ?? heute} required />
          </div>
          <div>
            <Label htmlFor="tf-sessionType">Art</Label>
            <Select id="tf-sessionType" name="sessionType"
              defaultValue={vorgabe?.sessionType ?? "backtest"}>
              <option value="backtest">Backtest</option>
              <option value="live">Live</option>
            </Select>
          </div>
        </div>

        {/* Zeile 2: Ergebnis */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="tf-result">Ergebnis</Label>
            <Select id="tf-result" name="result" value={ergebnis}
              onChange={(e) => setErgebnis(e.target.value)}>
              <option value="win">Gewinn</option>
              <option value="loss">Verlust</option>
              <option value="breakeven">Breakeven</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="tf-r">R-Vielfaches</Label>
            <Input id="tf-r" name="rMultiple" type="number" step="0.1" min="0"
              placeholder={ergebnis === "loss" ? "1 (Standard)" : "z.B. 2"}
              defaultValue={vorgabe?.rMultiple ?? ""} />
          </div>
          <div>
            <Label htmlFor="tf-session">Session</Label>
            <Select id="tf-session" name="session" defaultValue={vorgabe?.session ?? "London"}>
              <option value="">—</option>
              {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tf-strategy">Strategie</Label>
            <Select id="tf-strategy" name="strategyId" defaultValue="">
              <option value="">—</option>
              {strategien.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        {/* Zeile 3: Preise. Optional — im Backtest oft nicht nötig. */}
        <details className="rounded-xl bg-sand/40 px-3 py-2">
          <summary className="cursor-pointer text-xs text-ink-muted">
            Preise und Grösse (optional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <div>
              <Label htmlFor="tf-entry">Einstieg</Label>
              <Input id="tf-entry" name="entryPrice" type="number" step="any"
                defaultValue={vorgabe?.entryPrice ?? ""} />
            </div>
            <div>
              <Label htmlFor="tf-sl">Stop</Label>
              <Input id="tf-sl" name="stopLoss" type="number" step="any"
                defaultValue={vorgabe?.stopLoss ?? ""} />
            </div>
            <div>
              <Label htmlFor="tf-tp">Ziel</Label>
              <Input id="tf-tp" name="takeProfit" type="number" step="any"
                defaultValue={vorgabe?.takeProfit ?? ""} />
            </div>
            <div>
              <Label htmlFor="tf-exit">Ausstieg</Label>
              <Input id="tf-exit" name="exitPrice" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="tf-risk">Risiko %</Label>
              <Input id="tf-risk" name="riskPercent" type="number" step="0.1" placeholder="1" />
            </div>
          </div>
        </details>

        {/* Setups — der eigentliche Zweck der Erfassung */}
        <div>
          <Label>Setup</Label>
          <div className="flex flex-wrap gap-2">
            {SETUP_FELDER.map((s) => (
              <label key={s.key}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-sand px-3 py-1.5
                           text-sm text-ink-soft transition hover:bg-sand/70">
                <input type="checkbox" name={`setup_${s.key}`}
                  defaultChecked={vorgabe?.setups?.[s.key] ?? false}
                  className="accent-[#E7A96B]" />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        {/* Konfluenzen */}
        <div>
          <Label>Konfluenz</Label>
          <div className="flex flex-wrap gap-2">
            {konfluenzen.map((k) => (
              <label key={k}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-sand px-3 py-1.5
                           text-sm text-ink-soft transition hover:bg-sand/70">
                <input type="checkbox" name="confluences" value={k}
                  className="accent-[#E7A96B]" />
                {k}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="tf-notes">Notiz</Label>
          <textarea id="tf-notes" name="notes" rows={2}
            defaultValue={vorgabe?.notes ?? ""}
            placeholder="Was war der Gedanke? Was ist schiefgelaufen?"
            className={cx(
              "w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink",
              "placeholder:text-ink-faint outline-none transition",
              "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20",
            )} />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit">{bearbeiten ? "Änderungen speichern" : "Trade speichern"}</Button>
          {ergebnis === "loss" && (
            <Badge tone="neutral">Ohne R-Angabe wird −1R gerechnet</Badge>
          )}
        </div>
      </form>

      {bearbeiten && (
        <form action={tradeLoeschen} className="mt-3 border-t border-line/70 pt-3">
          <input type="hidden" name="id" value={vorgabe!.id} />
          <Button type="submit" variant="danger">Trade löschen</Button>
        </form>
      )}
    </Card>
  );
}
