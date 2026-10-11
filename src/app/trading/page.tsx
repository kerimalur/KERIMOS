import Link from "next/link";
import { tradingConfigured } from "@/lib/supabase/trading";
import { ladeAlarmBereitschaft, ladeMarkt, type MarktLinie } from "@/lib/markt/laden";
import { ZUSTAND_RANG, fmtPreis } from "@/lib/markt/rechnen";
import { ArchivZeile, LinienFormular, LinienZeile } from "@/components/markt/teile";
import { KopierFeld } from "@/components/alarm/kopierfeld";
import { WATCHLIST_MIGRATION_SQL } from "@/lib/trading/watchlist-migration";
import { Badge, Card, CardTitle, Empty, cx } from "@/components/ui";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Markt — Linien und Watchlist (11.10.2026).
 *
 * Umbau nach dem Interview vom 08.10. („Trading productivity"): Kerim trägt
 * seine Linien selbst ein, mit Begründung; der Auto-Screener läuft im
 * Hintergrund als Radar und Statistik. Jeder Treffer verlangt eine
 * Entscheidung — Trade oder Skip, mit Grund. Gezählt wird die Entscheidung,
 * nicht nur der Trade.
 *
 * Die Alarme bleiben unverändert: /api/gva-alarm liest weiter dieselben
 * Spalten von `trading_watchlist`. Neu sind nur Zusatzspalten und die Tabelle
 * `trading_entscheidungen` (supabase/trading/10_markt_watchlist.sql).
 *
 * Vorher hiess die Seite „Aktive Trades" (eine flache Liste mit Kategorien).
 * Die Kategorien gibt es weiter: Auswahl je Linie, Filter oben.
 */

type SP = { sort?: string; seite?: string; fokus?: string; kat?: string; archiv?: string };

const SORTIERUNG = [
  { key: "dringend", label: "Dringlichkeit" },
  { key: "abstand", label: "Abstand" },
  { key: "prio", label: "Priorität" },
  { key: "neu", label: "Neueste" },
] as const;

function link(sp: SP, aender: Partial<SP>): string {
  const q = new URLSearchParams();
  const neu = { ...sp, ...aender };
  for (const [k, v] of Object.entries(neu)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/trading?${s}` : "/trading";
}

function Chip({ aktiv, href, children }: { aktiv: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false}
      className={cx("rounded-full border px-3 py-1 text-xs transition",
        aktiv ? "border-accent bg-accent-tint text-accent-soft" : "border-line bg-sand text-ink-muted hover:border-line-strong hover:text-ink")}>
      {children}
    </Link>
  );
}

function Kachel({ titel, wert, hinweis, ton }: { titel: string; wert: string; hinweis?: string; ton?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-card px-4 py-3 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{titel}</p>
      <p className={cx("tabular mt-1 font-display text-2xl font-bold", ton === "bad" ? "text-bad-bright" : ton === "good" ? "text-good-bright" : "text-ink")}>{wert}</p>
      {hinweis && <p className="mt-0.5 text-[11px] text-ink-faint">{hinweis}</p>}
    </div>
  );
}

const dringlich = (a: MarktLinie, b: MarktLinie) =>
  ZUSTAND_RANG[a.zustand] - ZUSTAND_RANG[b.zustand]
  || Number(b.fokus) - Number(a.fokus)
  || b.prioritaet - a.prioritaet
  || (a.abstand ?? 9e9) - (b.abstand ?? 9e9);

export default async function MarktSeite({ searchParams }: { searchParams: Promise<SP> }) {
  if (!tradingConfigured()) {
    return <Card><Empty>Trading-Datenbank nicht verbunden.</Empty></Card>;
  }
  const sp = await searchParams;
  const [m, alarm] = await Promise.all([ladeMarkt(), ladeAlarmBereitschaft()]);

  /* ------------------------------------------------ Filter und Sortierung */
  let sicht = m.linien;
  if (sp.seite === "long" || sp.seite === "short") sicht = sicht.filter((l) => l.side === sp.seite);
  if (sp.fokus === "1") sicht = sicht.filter((l) => l.fokus);
  if (sp.kat) sicht = sicht.filter((l) => (sp.kat === "ohne" ? !l.kategorie_id : l.kategorie_id === sp.kat));

  const sortiert = [...sicht].sort(
    sp.sort === "abstand" ? (a, b) => (a.abstand ?? 9e9) - (b.abstand ?? 9e9)
      : sp.sort === "prio" ? (a, b) => b.prioritaet - a.prioritaet || dringlich(a, b)
        : sp.sort === "neu" ? (a, b) => b.created_at.localeCompare(a.created_at)
          : dringlich,
  );

  // Gruppiert nach Pair; die Gruppen stehen in der Reihenfolge ihrer ersten Linie.
  const gruppen: { pair: string; linien: MarktLinie[] }[] = [];
  for (const l of sortiert) {
    const g = gruppen.find((x) => x.pair === l.pair);
    if (g) g.linien.push(l); else gruppen.push({ pair: l.pair, linien: [l] });
  }

  const faellig = m.linien.filter((l) => l.zustand === "erreicht" && !l.entscheidung)
    .sort(dringlich);
  const nah = m.linien.filter((l) => l.zustand === "nah").length;
  const fokusAnzahl = m.linien.filter((l) => l.fokus).length;
  const pairsAnzahl = new Set(m.linien.map((l) => l.pair)).size;
  const ohnePreis = m.linien.filter((l) => l.line_level !== null && l.abstand === null).length;

  const stand = m.zahlen.screenerStand ? Date.parse(m.zahlen.screenerStand) : null;
  const standMin = stand ? Math.round((Date.now() - stand) / 60_000) : null;

  return (
    <div className="space-y-5">
      {/* Kopf */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-ink">Markt</h1>
            {faellig.length > 0 && <Badge tone="bad">{faellig.length} Entscheidung{faellig.length === 1 ? "" : "en"} fällig</Badge>}
            {nah > 0 && <Badge tone="warn">{nah} nah</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Deine Linien mit Begründung, der Fundamental-Bias dazu und bei jedem Treffer eine Entscheidung:
            Trade oder Skip. Der Auto-Screener läuft als Radar im Hintergrund.
          </p>
        </div>
        <Link href="/trading/einstellungen" className="text-xs text-accent-soft hover:underline">Alarme einstellen ↗</Link>
      </div>

      {!alarm.zustellbar && (
        <Card>
          <p className="text-sm font-medium text-bad-bright">Alarme kommen aktuell nirgends an.</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
            {alarm.fehlt.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <Link href="/trading/alarme/einstellungen" className="mt-2 inline-block text-xs text-accent-soft hover:underline">Zu den Alarm-Einstellungen ↗</Link>
        </Card>
      )}
      {m.migrationFehlt && (
        <Card><p className="text-sm text-bad-bright">
          Die Datenbank-Erweiterung für den Markt-Tab fehlt (supabase/trading/10_markt_watchlist.sql). Die Liste
          läuft im Notbetrieb, Warum, Priorität, Check und Entscheidungen werden nicht gespeichert.
        </p></Card>
      )}
      {(standMin === null || standMin > 30) && (
        <Card><p className="text-sm text-warn">
          {standMin === null
            ? "Kein Live-Stand vom Screener (Render schläft oder ist nicht erreichbar) — Abstände und „erreicht“ stimmen so nicht."
            : `Der Screener-Stand ist ${standMin} Minuten alt — Abstände können abweichen.`}
        </p></Card>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kachel titel="Fällig" wert={String(faellig.length)} hinweis="Treffer ohne Entscheidung" ton={faellig.length ? "bad" : undefined} />
        <Kachel titel="Linien" wert={String(m.linien.length)} hinweis={`${pairsAnzahl} Pair${pairsAnzahl === 1 ? "" : "s"} · ${fokusAnzahl} im Fokus`} />
        <Kachel titel="Entscheidungen" wert={String(m.zahlen.entscheidungenWoche)} hinweis={`diese Woche · ${m.zahlen.entscheidungenGesamt} gesamt`} />
        <Kachel titel="Live-Trades" wert={String(m.zahlen.tradesMonat)} hinweis="diesen Monat · Ziel 4–6, ohne Zwang"
          ton={m.zahlen.tradesMonat >= 4 ? "good" : undefined} />
      </div>

      {/* Fällig */}
      {faellig.length > 0 && (
        <Card area="trading">
          <CardTitle>Entscheidung fällig</CardTitle>
          <p className="mb-3 text-xs text-ink-muted">
            Diese Linien sind erreicht. Drei Punkte prüfen, dann Trade oder Skip — mit Grund. Nicht entscheiden gibt es nicht.
          </p>
          <ul className="space-y-2">
            {faellig.map((l) => <LinienZeile key={l.id} l={l} kopf={m.paare[l.pair]} kategorien={m.kategorien} />)}
          </ul>
        </Card>
      )}

      {/* Watchlist */}
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Watchlist</CardTitle>
          <span className="text-[11px] text-ink-faint">
            {ohnePreis > 0 ? `${ohnePreis} Linie${ohnePreis === 1 ? "" : "n"} ohne Live-Preis · ` : ""}
            {sortiert.length} von {m.linien.length} sichtbar
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-faint">Sortieren</span>
            {SORTIERUNG.map((s) => (
              <Chip key={s.key} aktiv={(sp.sort ?? "dringend") === s.key} href={link(sp, { sort: s.key === "dringend" ? undefined : s.key })}>{s.label}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-faint">Filter</span>
            <Chip aktiv={!sp.seite} href={link(sp, { seite: undefined })}>alle</Chip>
            <Chip aktiv={sp.seite === "long"} href={link(sp, { seite: "long" })}>Long</Chip>
            <Chip aktiv={sp.seite === "short"} href={link(sp, { seite: "short" })}>Short</Chip>
            <Chip aktiv={sp.fokus === "1"} href={link(sp, { fokus: sp.fokus === "1" ? undefined : "1" })}>★ Fokus</Chip>
            {m.kategorien.map((k) => (
              <Chip key={k.id} aktiv={sp.kat === k.id} href={link(sp, { kat: sp.kat === k.id ? undefined : k.id })}>{k.name}</Chip>
            ))}
          </div>
        </div>

        {m.linien.length === 0 ? (
          <Empty>
            Noch keine Linie. Geh die Charts durch (Sonntagabend), trag unten ein, was du wirklich beobachten willst — mit einem
            Satz, warum. Danach meldet sich KerimOS, statt dass du nachsehen musst.
          </Empty>
        ) : sortiert.length === 0 ? (
          <Empty>Kein Treffer für diesen Filter. <Link href="/trading" className="text-accent-soft hover:underline">Filter zurücksetzen</Link></Empty>
        ) : (
          <div className="space-y-5">
            {gruppen.map((g) => {
              const k = m.paare[g.pair];
              return (
                <section key={g.pair}>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="font-display text-base font-bold text-ink">{g.pair}</h2>
                    <span className="tabular text-xs text-ink-muted" title={k.preisVeraltet ? "Tagesschluss, nicht live" : "Live"}>
                      {fmtPreis(g.pair, k.preis)}{k.preisVeraltet ? " · alt" : ""}
                    </span>
                    {k.screener && (
                      <Badge tone={k.screener.status === "HIT" ? "bad" : "warn"} title="Auto-Screener">
                        Screener {k.screener.status}{k.screener.tf ? ` · ${k.screener.tf}` : ""}
                      </Badge>
                    )}
                    <Badge tone={k.bias.seite === "long" ? "good" : k.bias.seite === "short" ? "bad" : "neutral"} title={k.bias.text}>
                      {k.bias.seite
                        ? `Urteil: ${k.bias.seite === "long" ? "Long" : "Short"} ${k.bias.klasse}`
                        : "Urteil: kein klarer Bias"}
                    </Badge>
                    <span className="text-[11px] text-ink-faint">{k.bias.text}</span>
                  </div>
                  <ul className="space-y-2">
                    {g.linien.map((l) => <LinienZeile key={l.id} l={l} kopf={k} kategorien={m.kategorien} />)}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      {/* Neue Linie */}
      <Card>
        <CardTitle>Neue Linie eintragen</CardTitle>
        <LinienFormular kategorien={m.kategorien} knopf="Aufnehmen" />
      </Card>

      {/* Radar */}
      <details className="rounded-2xl border border-line/70 bg-card px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Screener-Radar ({m.radar.length}) — nur zum Nachschlagen, entschieden wird auf deinen Linien
        </summary>
        {m.radar.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nichts im Radar (oder Screener nicht erreichbar).</p>
        ) : (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {m.radar.map((p) => (
              <li key={p.pair} className="flex items-center gap-2 rounded-lg bg-sand/50 px-3 py-1.5 text-xs">
                <span className="font-display font-bold text-ink">{p.pair}</span>
                <Badge tone={p.status === "HIT" ? "bad" : "warn"}>{p.status}</Badge>
                {p.near && <Badge tone={p.near === "LONG" ? "good" : "bad"}>{p.near === "LONG" ? "Long" : "Short"}</Badge>}
                <span className="tabular text-ink-muted">{p.distance !== null ? `${Math.round(p.distance)} Pips` : "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-ink-faint">
          Treffer übernehmen geht im <Link href="/trading/cockpit" className="text-accent-soft hover:underline">Cockpit</Link>.
        </p>
      </details>

      {/* Entscheidungen */}
      <details className="rounded-2xl border border-line/70 bg-card px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Entscheidungen ({m.zahlen.entscheidungenGesamt}) — Trade oder Skip, mit Grund
        </summary>
        {m.entscheidungen.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Noch keine. Die erste entsteht beim nächsten Treffer auf einer deiner Linien.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {m.entscheidungen.slice(0, 20).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-sand/50 px-3 py-1.5 text-xs">
                <span className="text-ink-faint">{dateLabel(e.erstellt_am.slice(0, 10))}</span>
                <span className="font-display font-bold text-ink">{e.pair}</span>
                <Badge tone={e.entscheidung === "trade" ? "good" : "neutral"}>{e.entscheidung === "trade" ? "Trade" : "Skip"}</Badge>
                <span className="text-ink-muted">{e.grund ?? ""}</span>
                <span className="ml-auto text-ink-faint">
                  Check {[e.check_abgeholt, e.check_bos, e.check_confluence].filter(Boolean).length}/3
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* Archiv */}
      <details open={sp.archiv === "1"} className="rounded-2xl border border-line/70 bg-card px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-medium text-ink">Archiv ({m.archiv.length})</summary>
        {m.archiv.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Leer. Archivierte Linien und Skips landen hier und melden keinen Alarm mehr.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">{m.archiv.map((l) => <ArchivZeile key={l.id} l={l} />)}</ul>
        )}
      </details>

      <details className="rounded-xl border border-line/60 bg-sand/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Mehrere Linien je Pair — einmalige Migration</summary>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Bis 21.08.2026 liess die Datenbank nur <strong>eine</strong> Zeile je Paar zu. Der Code legt jetzt mehrere an — die
          Bedingung in der Datenbank muss aber einmal von Hand weg, sonst kommt beim Speichern ein Fehler. SQL kopieren,
          im Supabase-SQL-Editor ausführen, fertig. Läuft die Migration ein zweites Mal, tut sie nichts.
        </p>
        <div className="mt-3"><KopierFeld text={WATCHLIST_MIGRATION_SQL} /></div>
      </details>

      <Card>
        <CardTitle>So ist es gedacht</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>Sonntagabend und bei Gelegenheit mittwochs: Charts durchgehen, Linien mit einem Satz „Warum“ eintragen, 3–6 Pairs in den Fokus.</li>
          <li>Nach dem Aufstehen 15 Minuten auf diese Seite. Steht oben „fällig“, ist eine Linie erreicht.</li>
          <li>Drei Punkte prüfen — abgeholt, BOS, Confluences — und entscheiden: Trade oder Skip, mit Grund.</li>
          <li>Der SL gehört direkt ins Order-Ticket. Ohne SL kein Trade.</li>
          <li>
            Fundamental-Bias und{" "}
            <Link href="/trading/fundamentals/rueckblick" className="text-accent-soft hover:underline">Wochenrückblick</Link>{" "}
            sind Hintergrund, nicht der Auslöser.
          </li>
        </ol>
      </Card>
    </div>
  );
}
