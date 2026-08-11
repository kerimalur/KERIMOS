"use client";
import { useState } from "react";
import { Input, Select, Label, Button, cx } from "@/components/ui";
import { addBacktestTrade, updateBacktestTrade } from "@/lib/backtest-actions";
import {
  RESULT_LABEL, berechneR,
  type BacktestCategory, type BacktestResult, type NativeBacktestTrade,
} from "@/lib/backtest-types";

/**
 * Trade erfassen oder ändern.
 *
 * Eine Komponente für beides: die Felder sind identisch, nur Aktion und
 * Vorbelegung unterscheiden sich. Zwei getrennte Formulare wären zwei
 * Stellen, an denen ein neues Feld vergessen werden kann.
 *
 * Das erreichte R rechnet sich aus Ergebnis und geplantem RR (Faktoren in
 * backtest-types.ts). Überschreiben bleibt möglich - der Backtest kennt
 * Fälle, in denen der Ausstieg woanders lag als geplant.
 */
export function BacktestTradeForm({
  sessionId, kategorien, trade, onFertig,
}: {
  sessionId: string;
  kategorien: {
    gvaTyp: BacktestCategory | null;
    confluence: BacktestCategory | null;
    anmerkung: BacktestCategory | null;
    skipGrund: BacktestCategory | null;
  };
  /** Gesetzt = Bearbeiten-Modus. */
  trade?: NativeBacktestTrade;
  onFertig?: () => void;
}) {
  const bearbeiten = Boolean(trade);
  const [result, setResult] = useState<BacktestResult>(trade?.result ?? "full_tp");
  const [rr, setRr] = useState(trade?.rr_geplant?.toString() ?? "");
  // Leer = automatisch. Sobald etwas drinsteht, gilt der Wert von Hand.
  const [rManuell, setRManuell] = useState(() => {
    if (!trade || trade.r_multiple === null) return "";
    const auto = berechneR(trade.result, trade.rr_geplant);
    return auto === trade.r_multiple ? "" : String(trade.r_multiple);
  });

  const rrZahl = rr.trim() === "" ? null : Number(rr.replace(",", "."));
  const rAuto = berechneR(result, Number.isFinite(rrZahl as number) ? rrZahl : null);
  const rWert = rManuell.trim() !== "" ? rManuell : (rAuto === null ? "" : String(rAuto));
  const istSkip = result === "skip";

  const tagAktiv = (id: string) => trade?.tags.some((t) => t.tagId === id) ?? false;

  return (
    <form action={bearbeiten ? updateBacktestTrade : addBacktestTrade}
      className="space-y-4" onSubmit={() => onFertig?.()}>
      {bearbeiten
        ? <input type="hidden" name="id" value={trade!.id} />
        : <input type="hidden" name="session_id" value={sessionId} />}
      {/* Der berechnete Wert muss mitgeschickt werden - ein deaktiviertes
          Feld sendet der Browser nicht. */}
      <input type="hidden" name="r_multiple" value={rWert} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`d-${trade?.id ?? "neu"}`}>Datum</Label>
          <Input id={`d-${trade?.id ?? "neu"}`} type="date" name="occurred_on"
            defaultValue={trade?.occurred_on ?? new Date().toISOString().slice(0, 10)} required />
        </div>
        <div>
          <Label htmlFor={`ri-${trade?.id ?? "neu"}`}>Richtung</Label>
          <Select id={`ri-${trade?.id ?? "neu"}`} name="direction" required
            defaultValue={trade?.direction ?? ""}>
            <option value="" disabled>— wählen —</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </Select>
        </div>
      </div>

      {kategorien.gvaTyp && (
        <div>
          <Label htmlFor={`g-${trade?.id ?? "neu"}`}>GVA-Typ</Label>
          <Select id={`g-${trade?.id ?? "neu"}`} name="gva_typ"
            defaultValue={trade?.tags.find((t) => t.categoryKey === "gva_typ")?.tagId ?? ""}>
            <option value="">— keine Angabe —</option>
            {kategorien.gvaTyp.tags.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`e-${trade?.id ?? "neu"}`}>Ergebnis</Label>
          <Select id={`e-${trade?.id ?? "neu"}`} name="result" value={result}
            onChange={(e) => setResult(e.target.value as BacktestResult)}>
            {Object.entries(RESULT_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`rr-${trade?.id ?? "neu"}`}>RR geplant</Label>
          <Input id={`rr-${trade?.id ?? "neu"}`} name="rr_geplant" type="number" step="0.01"
            value={rr} onChange={(e) => setRr(e.target.value)}
            placeholder="z. B. 3.00" disabled={istSkip} />
        </div>
        <div>
          <Label htmlFor={`r-${trade?.id ?? "neu"}`}>
            R erreicht {rManuell.trim() === "" && !istSkip && (
              <span className="text-ink-faint">· berechnet</span>
            )}
          </Label>
          <Input id={`r-${trade?.id ?? "neu"}`} type="number" step="0.01"
            value={rWert} placeholder={istSkip ? "—" : "automatisch"}
            onChange={(e) => setRManuell(e.target.value)}
            disabled={istSkip}
            className={cx(rManuell.trim() === "" && "text-ink-soft")} />
        </div>
      </div>

      {!istSkip && (
        <p className="text-[11px] text-ink-faint">
          {rAuto === null
            ? "Trag das geplante RR ein, dann rechnet sich das R von selbst."
            : `${RESULT_LABEL[result]} rechnet mit dem hinterlegten Faktor auf ${rAuto} R.`}
          {rManuell.trim() !== "" && (
            <> Du hast den Wert überschrieben —{" "}
              <button type="button" onClick={() => setRManuell("")}
                className="text-accent-soft hover:underline">
                zurück zur Berechnung
              </button>.
            </>
          )}
        </p>
      )}

      {istSkip && kategorien.skipGrund && (
        <div>
          <Label htmlFor={`sk-${trade?.id ?? "neu"}`}>Skip-Grund</Label>
          <Select id={`sk-${trade?.id ?? "neu"}`} name="skip_grund"
            defaultValue={trade?.tags.find((t) => t.categoryKey === "skip_grund")?.tagId ?? ""}>
            <option value="">— wählen —</option>
            {kategorien.skipGrund.tags.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </div>
      )}

      <TagFeld kategorie={kategorien.confluence} name="confluence"
        label="Confluence (mehrfach möglich)" aktiv={tagAktiv} />
      <TagFeld kategorie={kategorien.anmerkung} name="anmerkung"
        label="Anmerkung (mehrfach möglich)" aktiv={tagAktiv} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`tv-${trade?.id ?? "neu"}`}>TradingView-Link</Label>
          <Input id={`tv-${trade?.id ?? "neu"}`} name="tradingview_link"
            defaultValue={trade?.tradingview_link ?? ""}
            placeholder="https://www.tradingview.com/x/..." />
        </div>
        <div>
          <Label htmlFor={`sc-${trade?.id ?? "neu"}`}>Screenshot-URL</Label>
          <Input id={`sc-${trade?.id ?? "neu"}`} name="screenshot_url"
            defaultValue={trade?.screenshot_url ?? ""} placeholder="https://..." />
        </div>
      </div>
      <div>
        <Label htmlFor={`n-${trade?.id ?? "neu"}`}>Notiz</Label>
        <Input id={`n-${trade?.id ?? "neu"}`} name="notiz"
          defaultValue={trade?.notiz ?? ""} placeholder="Freitext" />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit">{bearbeiten ? "Änderungen speichern" : "Trade speichern"}</Button>
        {onFertig && (
          <button type="button" onClick={onFertig}
            className="text-xs text-ink-muted transition hover:text-ink-soft">
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

function TagFeld({
  kategorie, name, label, aktiv,
}: {
  kategorie: BacktestCategory | null;
  name: string;
  label: string;
  aktiv: (id: string) => boolean;
}) {
  if (!kategorie) return null;
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {kategorie.tags.map((t) => (
          <label key={t.id}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line
              bg-sand px-2.5 py-1 text-xs text-ink-soft transition
              has-[:checked]:border-accent/50 has-[:checked]:bg-accent-tint has-[:checked]:text-accent-soft">
            <input type="checkbox" name={name} value={t.id}
              defaultChecked={aktiv(t.id)} className="accent-accent" />
            {t.label}
          </label>
        ))}
      </div>
    </div>
  );
}
