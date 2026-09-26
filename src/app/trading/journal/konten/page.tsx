import {
  ladeKontoKette, KONTO_TYPEN, tradingUserId,
  type Konto, type KontoBuchung, type KontoVerlauf,
} from "@/lib/trading/journal";
import { tradingConfigured } from "@/lib/supabase/trading";
import {
  kontoSpeichern, kontoLoeschen, kontostandUebernehmen,
  buchungSpeichern, buchungLoeschen,
} from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Stat, Badge, Empty, Button, Input, Select, Label } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Konten — was tatsächlich auf dem Konto liegt.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/einstellungen`), siehe
 * TRADING-UMBAU.md.
 *
 * Solange Kerim im Backtest ist, braucht es diese Seite nicht: dort zählt R,
 * nicht der Kontostand. Vor dem Live-Gang schon — die FTMO-Regeln hängen an
 * absoluten Zahlen (Gewinnziel, maximaler Verlust, Tagesverlust), und die
 * lassen sich nur prüfen, wenn irgendwo steht, wie viel auf dem Konto ist.
 *
 * Der Kontostand wird **gerechnet**, nicht abgelesen:
 *
 *     Startkapital + Einzahlungen − Auszahlungen + realisierter Gewinn
 *
 * Daneben steht der Wert, der in der Datenbank hinterlegt ist. Laufen die
 * beiden auseinander, zeigt die Seite die Differenz an, statt eine der Zahlen
 * zur Wahrheit zu erklären. Die Differenz ist fast immer ein Trade, bei dem
 * der Betrag nicht erfasst wurde — und genau das will man sehen.
 */

const ART_LABEL: Record<string, string> = {
  deposit: "Einzahlung",
  withdrawal: "Auszahlung",
  payout: "Auszahlung (Payout)",
};

const chf = (n: number, waehrung: string) =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("de-CH", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })} ${waehrung}`;

function KontoKarte({ k, konto }: { k: KontoVerlauf; konto: Konto }) {
  const w = k.currency;
  // Ab einer Einheit Währung ist die Abweichung eine Aussage und kein
  // Rundungsrest — darunter wäre der Hinweis nur Lärm.
  const driftet = Math.abs(k.abweichung) >= 1;

  return (
    <Card area={konto.type === "funded" ? "trading" : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-bold text-ink">{konto.name}</span>
        <Badge tone={konto.type === "funded" ? "accent" : "neutral"}>
          {konto.type === "funded" ? "Funded" : "Eigenkapital"}
        </Badge>
        {konto.broker && <Badge tone="neutral">{konto.broker}</Badge>}
        {!konto.isActive && <Badge tone="neutral">ruht</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Berechnet" value={chf(k.stand, w)}
          tone={k.stand >= konto.initialBalance ? "good" : "bad"}
          sub={`Start ${chf(konto.initialBalance, w)}`} />
        <Stat label="Hinterlegt" value={chf(konto.currentBalance, w)}
          sub={driftet ? `Abweichung ${chf(k.abweichung, w)}` : "stimmt überein"}
          tone={driftet ? "warn" : "neutral"} />
        <Stat label="Ein / Aus"
          value={`${chf(k.einzahlungen, w)}`}
          sub={`${chf(k.auszahlungen, w)} ausgezahlt`} />
        <Stat label="Handel"
          value={chf(k.handelsGewinn, w)}
          tone={k.handelsGewinn > 0 ? "good" : k.handelsGewinn < 0 ? "bad" : "neutral"}
          sub={`${k.trades} Live-Trades`} />
      </div>

      {driftet && (
        <div className="mt-4 rounded-xl bg-warn-tint px-3 py-2.5">
          <p className="text-sm text-accent">
            Gerechnet und hinterlegt liegen {chf(Math.abs(k.abweichung), w)} auseinander.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Meist fehlt bei einem Live-Trade der Betrag, oder eine Ein-/Auszahlung
            ist nicht erfasst. Erst nachsehen, dann übernehmen.
          </p>
          <form action={kontostandUebernehmen} className="mt-2.5">
            <input type="hidden" name="id" value={konto.id} />
            <input type="hidden" name="wert" value={String(k.stand)} />
            <button type="submit"
              className="rounded-lg bg-sand px-2.5 py-1 text-xs text-ink-soft transition hover:text-ink">
              Gerechneten Stand übernehmen
            </button>
          </form>
        </div>
      )}

      <div className="mt-4 border-t border-line/70 pt-3">
        <details>
          <summary className="cursor-pointer text-xs text-ink-muted">Konto bearbeiten</summary>
          <form action={kontoSpeichern} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={konto.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={`n-${konto.id}`}>Name</Label>
                <Input id={`n-${konto.id}`} name="name" defaultValue={konto.name} required />
              </div>
              <div>
                <Label htmlFor={`b-${konto.id}`}>Broker</Label>
                <Input id={`b-${konto.id}`} name="broker" defaultValue={konto.broker} />
              </div>
              <div>
                <Label htmlFor={`t-${konto.id}`}>Art</Label>
                <Select id={`t-${konto.id}`} name="type" defaultValue={konto.type}>
                  <option value="ek">Eigenkapital</option>
                  <option value="funded">Funded</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor={`s-${konto.id}`}>Startkapital</Label>
                <Input id={`s-${konto.id}`} name="initialBalance" type="number" step="any"
                  defaultValue={konto.initialBalance} />
              </div>
              <div>
                <Label htmlFor={`c-${konto.id}`}>Stand</Label>
                <Input id={`c-${konto.id}`} name="currentBalance" type="number" step="any"
                  defaultValue={konto.currentBalance} />
              </div>
              <div>
                <Label htmlFor={`w-${konto.id}`}>Währung</Label>
                <Input id={`w-${konto.id}`} name="currency" defaultValue={konto.currency} />
              </div>
              <div>
                <Label htmlFor={`r-${konto.id}`}>Risiko % je Trade</Label>
                <Input id={`r-${konto.id}`} name="risk" type="number" step="0.1"
                  defaultValue={konto.defaultRiskPerTrade} />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="isActive" defaultChecked={konto.isActive}
                className="accent-[#E7A96B]" />
              aktiv
            </label>
            <div className="flex items-center gap-2">
              <Button type="submit">Speichern</Button>
            </div>
          </form>
          <form action={kontoLoeschen} className="mt-2">
            <input type="hidden" name="id" value={konto.id} />
            <button type="submit"
              className="text-xs text-ink-faint transition hover:text-bad-bright">
              Konto löschen
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}

export default async function KontenSeite() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const { verlauf, konten, buchungen, live: liveTrades } = await ladeKontoKette();
  // Je angelegtes Konto eine Karte: die Kette liefert die Zahlen, die
  // Kontozeile die Stammdaten (Broker, Risiko, aktiv).
  const staende = KONTO_TYPEN
    .map((t) => {
      const v = verlauf.proTyp.get(t);
      const konto = konten.find((k) => k.type === t);
      return v && konto ? { v, konto } : null;
    })
    .filter((x): x is { v: KontoVerlauf; konto: Konto } => x !== null);

  const ohneBetrag = liveTrades.filter((t) => t.profitAmount === null && t.result);
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {konten.length === 0 ? (
        <Card>
          <CardTitle>Noch kein Konto</CardTitle>
          <Empty>
            Solange du im Backtest bist, brauchst du hier nichts. Ab dem ersten
            Live-Trade — oder spätestens für die FTMO-Challenge — legst du unten
            ein Konto an; dann lässt sich prüfen, ob du die Regeln einhältst.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {staende.map((x) => <KontoKarte key={x.konto.id} k={x.v} konto={x.konto} />)}
        </div>
      )}

      {ohneBetrag.length > 0 && (
        <Card flat>
          <CardTitle>Live-Trades ohne Betrag</CardTitle>
          <p className="text-sm text-ink-muted">
            {ohneBetrag.length} von {liveTrades.length} Live-Trades haben kein
            Gewinn-/Verlustfeld. Sie zählen im R-Ergebnis mit, aber nicht im
            Kontostand — das erklärt Abweichungen.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ohneBetrag.slice(0, 12).map((t) => (
              <Badge key={t.id} tone="neutral">{t.date.slice(5)} {t.pair}</Badge>
            ))}
            {ohneBetrag.length > 12 && (
              <span className="text-xs text-ink-faint">+{ohneBetrag.length - 12}</span>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Neues Konto</CardTitle>
        <form action={kontoSpeichern} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="nk-name">Name</Label>
              <Input id="nk-name" name="name" required placeholder="z.B. FTMO 100k" />
            </div>
            <div>
              <Label htmlFor="nk-broker">Broker</Label>
              <Input id="nk-broker" name="broker" placeholder="FTMO" />
            </div>
            <div>
              <Label htmlFor="nk-type">Art</Label>
              <Select id="nk-type" name="type" defaultValue="ek">
                <option value="ek">Eigenkapital</option>
                <option value="funded">Funded</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="nk-start">Startkapital</Label>
              <Input id="nk-start" name="initialBalance" type="number" step="any" required />
            </div>
            <div>
              <Label htmlFor="nk-currency">Währung</Label>
              <Input id="nk-currency" name="currency" defaultValue="USD" />
            </div>
            <div>
              <Label htmlFor="nk-risk">Risiko % je Trade</Label>
              <Input id="nk-risk" name="risk" type="number" step="0.1" defaultValue="1" />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="isActive" defaultChecked className="accent-[#E7A96B]" />
            aktiv
          </label>
          <Button type="submit">Konto anlegen</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Ein- oder Auszahlung erfassen</CardTitle>
        {konten.length === 0 ? (
          <Empty>Erst ein Konto anlegen.</Empty>
        ) : (
          <form action={buchungSpeichern} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="bu-konto">Konto</Label>
                <Select id="bu-konto" name="accountId" defaultValue={konten[0]?.id}>
                  {konten.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="bu-art">Art</Label>
                <Select id="bu-art" name="buchungsTyp" defaultValue="deposit">
                  <option value="deposit">Einzahlung</option>
                  <option value="withdrawal">Auszahlung</option>
                  <option value="payout">Payout (Funded)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="bu-betrag">Betrag</Label>
                <Input id="bu-betrag" name="amount" type="number" step="any" required />
              </div>
              <div>
                <Label htmlFor="bu-datum">Datum</Label>
                <Input id="bu-datum" name="date" type="date" defaultValue={heute} required />
              </div>
            </div>
            <div>
              <Label htmlFor="bu-note">Notiz</Label>
              <Input id="bu-note" name="note" placeholder="optional" />
            </div>
            <Button type="submit">Buchung speichern</Button>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle>Bewegungen ({buchungen.length})</CardTitle>
        {buchungen.length === 0 ? (
          <Empty>Noch keine Ein- oder Auszahlung erfasst.</Empty>
        ) : (
          <div>
            {buchungen.map((b: KontoBuchung) => {
              const konto = konten.find((k) => k.id === b.accountId);
              const raus = b.buchungsTyp !== "deposit";
              return (
                <div key={b.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/70 py-3 first:border-t-0">
                  <span className="tabular w-[72px] shrink-0 text-xs text-ink-faint">
                    {b.date.slice(8, 10)}.{b.date.slice(5, 7)}.{b.date.slice(2, 4)}
                  </span>
                  <span className="text-sm text-ink-soft">{konto?.name ?? "unbekanntes Konto"}</span>
                  <Badge tone={raus ? "bad" : "good"}>{ART_LABEL[b.buchungsTyp]}</Badge>
                  {b.note && <span className="text-xs text-ink-muted">{b.note}</span>}
                  <span className={`tabular ml-auto text-sm font-medium ${
                    raus ? "text-bad-bright" : "text-good-bright"
                  }`}>
                    {raus ? "−" : "+"}
                    {Math.abs(b.amount).toLocaleString("de-CH")} {konto?.currency ?? ""}
                  </span>
                  <form action={buchungLoeschen}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" title="Buchung löschen"
                      className="rounded-lg px-1.5 text-xs text-ink-faint transition hover:text-bad-bright">
                      ✕
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
