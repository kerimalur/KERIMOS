import Link from "next/link";
import {
  entscheidungFesthalten, fokusUmschalten, linieArchivieren, linieLoeschen,
  linieSpeichern, linieWiederherstellen, pruefungSpeichern,
} from "@/lib/markt-actions";
import { KategorieWahl } from "@/components/trading/kategorie-wahl";
import type { Kategorie } from "@/lib/trading/kategorien";
import type { MarktLinie, PaarKopf } from "@/lib/markt/laden";
import { fmtPreis, mitUrteil, pruefungErfuellt, pruefungOffen } from "@/lib/markt/rechnen";
import { Badge, Button, Input, Label, Select, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { GVA_NOTIZ } from "@/lib/trading/herkunft";

/**
 * Bausteine des Markt-Tabs (11.10.2026). Alles Server-Komponenten mit
 * normalen Formularen — bis auf die Kategorie-Wahl läuft nichts im Browser.
 */

const SEITE_TON = { long: "good", short: "bad" } as const;

export function Sterne({ n }: { n: number }) {
  return (
    <span className="tabular text-[11px] tracking-tighter text-warn" title={`Priorität ${n} von 3`}>
      {"●".repeat(n)}<span className="text-line-strong">{"●".repeat(3 - n)}</span>
    </span>
  );
}

/* ------------------------------------------------------------ Formular */

export function LinienFormular({
  linie, kategorien, paar, knopf,
}: { linie?: MarktLinie; kategorien: Kategorie[]; paar?: string; knopf: string }) {
  const id = linie ? `l-${linie.id}` : "neu";
  return (
    <form action={linieSpeichern} className="space-y-3">
      {linie && <input type="hidden" name="id" value={linie.id} />}
      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <Label htmlFor={`${id}-pair`}>Pair</Label>
          <Input id={`${id}-pair`} name="pair" required placeholder="EURUSD" defaultValue={linie?.pair ?? paar ?? ""}
            className="w-28 uppercase" />
        </div>
        <div>
          <Label htmlFor={`${id}-side`}>Seite</Label>
          <Select id={`${id}-side`} name="side" defaultValue={linie?.side ?? ""} className="w-28">
            <option value="">offen</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-level`}>Linie (Level)</Label>
          <Input id={`${id}-level`} name="line_level" type="number" step="0.00001" placeholder="1.0850"
            defaultValue={linie?.line_level ?? ""} className="w-32" />
        </div>
        <div>
          <Label htmlFor={`${id}-prio`}>Priorität</Label>
          <Select id={`${id}-prio`} name="prioritaet" defaultValue={String(linie?.prioritaet ?? 2)} className="w-28">
            <option value="1">1 · niedrig</option>
            <option value="2">2 · normal</option>
            <option value="3">3 · hoch</option>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-ink-soft">
          <input type="checkbox" name="fokus" defaultChecked={linie?.fokus ?? false} className="accent-accent" />
          Fokus der Woche
        </label>
      </div>

      <div>
        <Label htmlFor={`${id}-warum`}>Warum diese Linie?</Label>
        <Input id={`${id}-warum`} name="warum" defaultValue={linie?.warum ?? ""}
          placeholder="z.B. 3D-GVA seit Mai, Preis dreht dort zum dritten Mal" />
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-ink-soft">
          <input type="checkbox" name="alarm_on_hit" defaultChecked={linie?.alarm_on_hit ?? true} className="accent-accent" />
          Alarm bei Treffer
        </label>
        <div>
          <Label htmlFor={`${id}-pips`}>„Nah“ ab (Pips)</Label>
          <Input id={`${id}-pips`} name="alarm_pips" type="number" min="1" step="1" defaultValue={linie?.alarm_pips ?? 30} className="w-24" />
        </div>
        <div>
          <Label htmlFor={`${id}-zeit`}>Uhrzeit-Alarm</Label>
          <Input id={`${id}-zeit`} name="alarm_time" type="time" defaultValue={linie?.alarm_time?.slice(0, 5) ?? ""} className="w-28" />
        </div>
        <div>
          <Label htmlFor={`${id}-bis`}>Anzeigen bis</Label>
          <Input id={`${id}-bis`} name="show_until" type="date" defaultValue={linie?.show_until ?? ""} className="w-36" />
        </div>
        <div>
          <Label htmlFor={`${id}-bias`}>Dein Bias</Label>
          <Select id={`${id}-bias`} name="bias_eigen" defaultValue={linie?.bias_eigen ?? ""} className="w-28">
            <option value="">—</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="neutral">neutral</option>
          </Select>
        </div>
        {kategorien.length > 0 && (
          <div>
            <Label htmlFor={`${id}-kat`}>Kategorie</Label>
            <Select id={`${id}-kat`} name="kategorie_id" defaultValue={linie?.kategorie_id ?? ""} className="w-40">
              <option value="">— ohne —</option>
              {kategorien.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-48 flex-1">
          <Label htmlFor={`${id}-chart`}>Chart-Link (TradingView)</Label>
          <Input id={`${id}-chart`} name="chart_url" type="url" placeholder="https://www.tradingview.com/x/…" defaultValue={linie?.chart_url ?? ""} />
        </div>
        <div className="min-w-48 flex-1">
          <Label htmlFor={`${id}-note`}>Notiz</Label>
          <Input id={`${id}-note`} name="note" defaultValue={linie?.note ?? ""} placeholder="optional" />
        </div>
        <Button type="submit">{knopf}</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------ Entscheidung */

const DREI = [
  { name: "abgeholt", label: "Abgeholt?", hilfe: "Liquidität über/unter der Linie genommen" },
  { name: "bos", label: "BOS?", hilfe: "Break of Structure auf der richtigen Seite" },
  { name: "confluence", label: "Confluences?", hilfe: "mindestens zwei" },
] as const;

function Dreiwert({ name, wert }: { name: string; wert: boolean | null }) {
  const aktuell = wert === true ? "ja" : wert === false ? "nein" : "";
  return (
    <Select name={name} defaultValue={aktuell} className="w-24">
      <option value="">offen</option>
      <option value="ja">ja</option>
      <option value="nein">nein</option>
    </Select>
  );
}

export function EntscheidungsFormular({ l, bias }: { l: MarktLinie; bias: string }) {
  return (
    <form action={entscheidungFesthalten} className="space-y-3">
      <input type="hidden" name="id" value={l.id} />
      <input type="hidden" name="bias" value={bias} />
      <div className="flex flex-wrap gap-3">
        {DREI.map((d) => (
          <div key={d.name} title={d.hilfe}>
            <Label>{d.label}</Label>
            <Dreiwert name={d.name} wert={d.name === "abgeholt" ? l.check_abgeholt : d.name === "bos" ? l.check_bos : l.check_confluence} />
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor={`g-${l.id}`}>Grund (bei Skip Pflicht)</Label>
        <Input id={`g-${l.id}`} name="grund" placeholder="z.B. kein BOS, nur eine Confluence" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="entscheidung" value="trade"
          className="inline-flex min-h-[40px] items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink-on transition hover:bg-accent-deep">
          Trade nehmen → Journal
        </button>
        <button type="submit" name="entscheidung" value="skip"
          className="inline-flex min-h-[40px] items-center rounded-full border border-line bg-sand px-4 py-2 text-sm font-semibold text-ink-soft transition hover:border-line-strong hover:text-ink">
          Skip (archivieren)
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">
        Beides zählt als Entscheidung. Der SL gehört direkt ins Order-Ticket — ohne SL kein Trade.
      </p>
    </form>
  );
}

/* --------------------------------------------------------------- Zeile */

export function LinienZeile({
  l, kopf, kategorien, mitEntscheidung = true,
}: { l: MarktLinie; kopf: PaarKopf; kategorien: Kategorie[]; mitEntscheidung?: boolean }) {
  const passt = mitUrteil(l.side, kopf.bias);
  const offen = pruefungOffen({ abgeholt: l.check_abgeholt, bos: l.check_bos, confluence: l.check_confluence });
  const ok = pruefungErfuellt({ abgeholt: l.check_abgeholt, bos: l.check_bos, confluence: l.check_confluence });
  const rahmen = l.zustand === "erreicht" ? "ring-1 ring-bad/40 bg-bad-tint/30"
    : l.zustand === "nah" ? "ring-1 ring-warn/40 bg-warn-tint/30" : "bg-sand/50";

  return (
    <li className={cx("rounded-xl px-3 py-2.5 text-sm", rahmen)}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <form action={fokusUmschalten}>
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="fokus" value={l.fokus ? "aus" : "an"} />
          <button type="submit" title={l.fokus ? "Fokus entfernen" : "Als Fokus der Woche markieren"}
            className={cx("text-base leading-none transition", l.fokus ? "text-warn" : "text-line-strong hover:text-warn")}>
            {l.fokus ? "★" : "☆"}
          </button>
        </form>
        <Sterne n={l.prioritaet} />
        {l.side
          ? <Badge tone={SEITE_TON[l.side]}>{l.side === "long" ? "Long" : "Short"}</Badge>
          : <Badge tone="neutral">Seite offen</Badge>}
        <span className="tabular font-medium text-ink">@ {l.line_level === null ? "ohne Level" : fmtPreis(l.pair, l.line_level)}</span>

        {l.abstand !== null ? (
          <span className={cx("tabular text-xs", l.zustand === "erreicht" ? "font-semibold text-bad-bright" : l.zustand === "nah" ? "font-semibold text-warn" : "text-ink-muted")}>
            {l.zustand === "erreicht" && l.abstand >= 1 ? "Treffer gemeldet" : l.abstand < 1 ? "erreicht" : `${Math.round(l.abstand)} Pips`}
            {l.lage && l.abstand >= 1 ? (l.lage === "ueber" ? " drüber" : " drunter") : ""}
          </span>
        ) : l.line_level !== null ? <Badge tone="neutral">kein Live-Preis</Badge> : null}

        {passt === true && <Badge tone="good" title={kopf.bias.text}>mit dem Urteil</Badge>}
        {passt === false && <Badge tone="warn" title={kopf.bias.text}>gegen das Urteil</Badge>}
        {l.bias_eigen && <Badge tone="accent" title="Dein Bias">Du: {l.bias_eigen === "neutral" ? "neutral" : l.bias_eigen}</Badge>}

        <Badge tone={ok === 3 ? "good" : offen === 3 ? "neutral" : "warn"} title="Abgeholt · BOS · Confluences">
          Check {ok}/3
        </Badge>
        {l.entscheidung && (
          <Badge tone={l.entscheidung.entscheidung === "trade" ? "good" : "neutral"}
            title={l.entscheidung.grund ?? undefined}>
            {l.entscheidung.entscheidung === "trade" ? "Trade entschieden" : "Skip"}
          </Badge>
        )}
        {l.note?.startsWith(GVA_NOTIZ) && <Badge tone="accent" title={l.note}>aus dem Cockpit</Badge>}
        {l.alarm_on_hit && <Badge tone="neutral">Alarm</Badge>}
        {l.alarm_time && <Badge tone="neutral">{l.alarm_time.slice(0, 5)}</Badge>}
        {l.show_until && <span className="text-[11px] text-ink-faint">bis {dateLabel(l.show_until)}</span>}

        <span className="ml-auto flex flex-wrap items-center gap-3">
          <KategorieWahl id={l.id} aktuell={l.kategorie_id} kategorien={kategorien} />
          {l.chart_url && <a href={l.chart_url} target="_blank" rel="noreferrer" className="text-xs text-accent-soft hover:underline">Chart ↗</a>}
          <Link href={`/trading/journal/trades?neu=${l.id}`} className="text-xs text-accent-soft hover:underline">Trade eintragen →</Link>
        </span>
      </div>

      {(l.warum || (l.note && !l.note.startsWith(GVA_NOTIZ))) && (
        <p className="mt-1.5 text-xs text-ink-muted">
          {l.warum && <span><span className="text-ink-faint">Warum:</span> {l.warum}</span>}
          {l.warum && l.note && !l.note.startsWith(GVA_NOTIZ) && " · "}
          {l.note && !l.note.startsWith(GVA_NOTIZ) && <span className="text-ink-faint">{l.note}</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-1 text-xs">
        {mitEntscheidung && (
          <details className="group">
            <summary className="cursor-pointer text-accent-soft">Prüfen &amp; entscheiden</summary>
            <div className="mt-2 rounded-xl border border-line/60 bg-card p-3">
              <EntscheidungsFormular l={l} bias={kopf.bias.text} />
            </div>
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-ink-muted">Bearbeiten</summary>
          <div className="mt-2 rounded-xl border border-line/60 bg-card p-3">
            <LinienFormular linie={l} kategorien={kategorien} knopf="Speichern" />
            <p className="mt-2 text-[11px] text-ink-faint">
              Ändert sich das Level, meldet der Alarm wieder neu am neuen Level.
            </p>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer text-ink-muted">Nur Check</summary>
          <form action={pruefungSpeichern} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line/60 bg-card p-3">
            <input type="hidden" name="id" value={l.id} />
            {DREI.map((d) => (
              <div key={d.name}><Label>{d.label}</Label>
                <Dreiwert name={d.name} wert={d.name === "abgeholt" ? l.check_abgeholt : d.name === "bos" ? l.check_bos : l.check_confluence} />
              </div>
            ))}
            <Button type="submit" variant="ghost">Festhalten</Button>
          </form>
        </details>
        <form action={linieArchivieren} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={l.id} />
          <input name="grund" placeholder="Grund (optional)" className="w-36 rounded-lg border border-line/70 bg-sand px-2 py-1 text-xs text-ink-muted" />
          <button className="text-ink-faint transition hover:text-bad">archivieren</button>
        </form>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- Archiv */

export function ArchivZeile({ l }: { l: MarktLinie }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/50 px-3 py-1.5 text-xs">
      <span className="font-display font-bold text-ink">{l.pair}</span>
      {l.side && <Badge tone={SEITE_TON[l.side]}>{l.side === "long" ? "Long" : "Short"}</Badge>}
      <span className="tabular text-ink-muted">@ {l.line_level ?? "—"}</span>
      <span className="text-ink-faint">{l.archiv_grund ?? "archiviert"}{l.archiviert_am ? ` · ${dateLabel(l.archiviert_am.slice(0, 10))}` : ""}</span>
      <span className="ml-auto flex items-center gap-3">
        <form action={linieWiederherstellen}>
          <input type="hidden" name="id" value={l.id} />
          <button className="text-accent-soft hover:underline">wiederherstellen</button>
        </form>
        <form action={linieLoeschen}>
          <input type="hidden" name="id" value={l.id} />
          <button className="text-ink-faint transition hover:text-bad">löschen</button>
        </form>
      </span>
    </li>
  );
}
