import { fetchOutlooks, PAARE, tradingUserId, type Outlook } from "@/lib/trading/journal";
import {
  tradingConfigured, fetchRanking, checkFundamental, type RankingCurrency,
} from "@/lib/supabase/trading";
import {
  outlookSpeichern, outlookStatusSetzen, outlookSternSetzen, outlookLoeschen,
} from "@/lib/journal-actions";
import { JournalHinweis } from "@/components/journal-hinweis";
import { Card, CardTitle, Badge, Empty, Button, Input, Select, Label, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Outlook — die Thesen, bevor daraus ein Trade wird.
 *
 * Umgezogen aus dem GVA-Screener (`/journal/outlook`), siehe TRADING-UMBAU.md.
 *
 * Der Zweck ist Disziplin, nicht Dokumentation: Wer die These vorher
 * aufschreibt, kann hinterher nachlesen, ob er seinem Plan gefolgt ist oder
 * ihn im Nachhinein passend gemacht hat. Deshalb steht bei jeder These die
 * fundamentale Gegenprobe daneben — sie kommt aus demselben Wochen-Ranking,
 * das auch das Board benutzt, und wird nicht von Hand eingetragen.
 */

const STATUS = [
  { key: "observation", label: "Beobachtung", tone: "neutral" as const },
  { key: "active", label: "Aktiv", tone: "accent" as const },
  { key: "executed", label: "Gehandelt", tone: "good" as const },
  { key: "closed", label: "Abgelegt", tone: "neutral" as const },
];

const KONFLUENZEN = [
  "Fundamental", "Technisch", "Saisonal", "COT", "Intermarket",
  "SMC", "Liquidität", "Imbalance",
] as const;

function statusInfo(key: string) {
  return STATUS.find((s) => s.key === key) ?? STATUS[0];
}

function ThesenKarte({ o, ranking }: { o: Outlook; ranking: RankingCurrency[] }) {
  const si = statusInfo(o.status);
  const f = checkFundamental(
    o.symbol,
    o.direction === "long" ? "LONG" : "SHORT",
    ranking,
  );

  return (
    <div className="rounded-2xl border border-line/70 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-bold text-ink">{o.symbol}</span>
        <Badge tone={o.direction === "long" ? "good" : "bad"}>
          {o.direction === "long" ? "Long" : "Short"}
        </Badge>
        <Badge tone={si.tone}>{si.label}</Badge>
        {o.source === "gva" && <Badge tone="accent">aus GVA-Hit</Badge>}
        {f.urteil !== "unbekannt" && (
          <Badge
            tone={f.urteil === "bestaetigt" ? "good" : f.urteil === "dagegen" ? "bad" : "neutral"}
            title={f.grund || undefined}>
            {f.urteil === "bestaetigt" ? "fundamental dafür"
              : f.urteil === "dagegen" ? "fundamental dagegen" : "fundamental neutral"}
          </Badge>
        )}

        <form action={outlookSternSetzen} className="ml-auto">
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="wert" value={o.isStarred ? "0" : "1"} />
          <button type="submit" title={o.isStarred ? "Stern entfernen" : "hervorheben"}
            className={cx("rounded-lg px-1.5 text-sm transition",
              o.isStarred ? "text-accent" : "text-ink-faint hover:text-ink-muted")}>
            ★
          </button>
        </form>
      </div>

      {o.thesis && (
        <p className="mt-2.5 whitespace-pre-wrap text-sm text-ink-soft">{o.thesis}</p>
      )}

      {(o.targetEntry !== null || o.targetSl !== null || o.targetTp !== null) && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {o.targetEntry !== null && <span>Einstieg <span className="tabular text-ink-soft">{o.targetEntry}</span></span>}
          {o.targetSl !== null && <span>Stop <span className="tabular text-ink-soft">{o.targetSl}</span></span>}
          {o.targetTp !== null && <span>Ziel <span className="tabular text-ink-soft">{o.targetTp}</span></span>}
        </div>
      )}

      {o.confluences.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {o.confluences.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3">
        {STATUS.filter((s) => s.key !== o.status).map((s) => (
          <form key={s.key} action={outlookStatusSetzen}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="status" value={s.key} />
            <button type="submit"
              className="rounded-lg bg-sand px-2.5 py-1 text-xs text-ink-muted transition hover:text-ink-soft">
              → {s.label}
            </button>
          </form>
        ))}
        <form action={outlookLoeschen} className="ml-auto">
          <input type="hidden" name="id" value={o.id} />
          <button type="submit"
            className="rounded-lg px-2 py-1 text-xs text-ink-faint transition hover:text-bad-bright">
            löschen
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function OutlookSeite() {
  if (!tradingConfigured()) return <JournalHinweis grund="keine-db" />;
  const userId = await tradingUserId();
  if (!userId) return <JournalHinweis grund="kein-user" />;

  const [outlooks, ranking] = await Promise.all([fetchOutlooks(), fetchRanking()]);

  const offen = outlooks.filter((o) => o.status === "observation" || o.status === "active");
  const erledigt = outlooks.filter((o) => o.status === "executed" || o.status === "closed");

  // Hervorgehobene zuerst, dann die aktiven, dann der Rest.
  offen.sort((a, b) =>
    Number(b.isStarred) - Number(a.isStarred) ||
    (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) ||
    b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Neue These</CardTitle>
        <form action={outlookSpeichern} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="ol-symbol">Paar</Label>
              <Select id="ol-symbol" name="symbol" defaultValue="EURUSD" required>
                {PAARE.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ol-direction">Richtung</Label>
              <Select id="ol-direction" name="direction" defaultValue="long">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ol-confidence">Überzeugung</Label>
              <Select id="ol-confidence" name="confidence" defaultValue="3">
                <option value="1">1 — dünn</option>
                <option value="2">2</option>
                <option value="3">3 — normal</option>
                <option value="4">4</option>
                <option value="5">5 — klar</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ol-status">Status</Label>
              <Select id="ol-status" name="status" defaultValue="observation">
                {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ol-entry">Einstieg</Label>
              <Input id="ol-entry" name="targetEntry" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="ol-sl">Stop</Label>
              <Input id="ol-sl" name="targetSl" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="ol-tp">Ziel</Label>
              <Input id="ol-tp" name="targetTp" type="number" step="any" />
            </div>
          </div>

          <div>
            <Label>Konfluenz</Label>
            <div className="flex flex-wrap gap-2">
              {KONFLUENZEN.map((k) => (
                <label key={k}
                  className="flex cursor-pointer items-center gap-2 rounded-xl bg-sand px-3 py-1.5
                             text-sm text-ink-soft transition hover:bg-sand/70">
                  <input type="checkbox" name="confluences" value={k} className="accent-[#E7A96B]" />
                  {k}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ol-thesis">These</Label>
            <textarea id="ol-thesis" name="thesis" rows={3}
              placeholder="Warum dieses Paar, warum diese Richtung, was müsste passieren, damit die These falsch ist?"
              className={cx(
                "w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink",
                "placeholder:text-ink-faint outline-none transition",
                "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20",
              )} />
          </div>

          <Button type="submit">These speichern</Button>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Offen ({offen.length})
        </h2>
        {offen.length === 0 ? (
          <Card><Empty>Keine offene These.</Empty></Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {offen.map((o) => <ThesenKarte key={o.id} o={o} ranking={ranking} />)}
          </div>
        )}
      </div>

      {erledigt.length > 0 && (
        <div>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Erledigt ({erledigt.length})
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {erledigt.slice(0, 12).map((o) => <ThesenKarte key={o.id} o={o} ranking={ranking} />)}
          </div>
        </div>
      )}
    </div>
  );
}
