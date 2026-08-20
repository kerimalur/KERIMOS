import Link from "next/link";
import { Suspense } from "react";
import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO } from "@/lib/time";
import { PAARE, ampelFuer } from "@/lib/confluence/faktoren";
import { baueJetzt, baueRueckblick, baueBilanz, type Ansicht } from "@/lib/confluence/seite";
import { baueMontyCot, baueSaisonZeile, MONTY_PAARE } from "@/lib/confluence/monty";
import { FENSTER, MAX_JAHRE, MIN_JAHRE, type Fenster } from "@/lib/confluence/saison";
import { CotStatistikTabelle, SaisonKopf, SaisonZeile, SaisonZeileLaedt } from "@/components/confluence/monty-teile";
import {
  RegimeKarte, WaehrungsTabelle, PaarTabelle, UrteilKarte,
  FaktorZeile, VetoZeile, Luecken,
  WaehrungsLeiste, PaarMatrix, HandelbarListe,
} from "@/components/confluence/teile";
import {
  GruppenTabelle, BefundKarte, VetoKarte, VerteilungKarte, TradeListe,
} from "@/components/confluence/bilanz-teile";
import { Card, CardTitle, Input, Select, Label, Button, Badge, Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Confluences — objektive Fundamentaldaten als Filter für Einstiege, die
 * technisch am Chart entstehen.
 *
 * Vier Ansichten, eine Rechnung:
 *   Terminal   Der Blick zuerst: Score je Währung, Ampel je Paar.
 *   Jetzt      Dieselbe Lage mit allen Rohwerten dahinter.
 *   Rückblick  Hätte ich bei diesem Trade Rückenwind gehabt?
 *   Bilanz     Hat der Rückenwind über alle eigenen Trades etwas bewirkt?
 *
 * Terminal und Jetzt rufen dieselbe Funktion mit demselben Stichtag auf —
 * sie können gar nicht auseinanderlaufen. Das Terminal lässt nur weg.
 *
 * Fünf Faktoren, nicht zwölf: Zinsdifferenz mit 6-Monats-Richtung,
 * Zinserwartung, Realzins, Risiko-Regime — und COT als Veto ohne eigene
 * Richtung, getrennt nach Fonds und Real Money. Je mehr Faktoren,
 * desto sicherer findet man für jede Richtung eine Begründung; ein Filter,
 * der nie „nein" sagt, ist keiner. Siehe ../../TRADING-UMBAU.md, Abschnitt 4b.
 */

const ANSICHTEN: { key: Ansicht; label: string; hinweis: string }[] = [
  { key: "terminal", label: "Terminal", hinweis: "Welche Paare kann ich heute überhaupt handeln?" },
  { key: "monty", label: "Monty", hinweis: "Nur COT und Saisonalität — ohne Zins und Inflation." },
  { key: "jetzt", label: "Jetzt", hinweis: "Dieselbe Lage mit allen Rohwerten dahinter." },
  { key: "rueckblick", label: "Rückblick", hinweis: "Hättest du an dem Tag Rückenwind gehabt?" },
  { key: "bilanz", label: "Bilanz", hinweis: "Hat der Rückenwind bei deinen Trades gewirkt?" },
];

type Params = Promise<Record<string, string | string[] | undefined>>;

const einer = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;

export default async function ConfluencePage({ searchParams }: { searchParams: Params }) {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Confluences</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen TRADING_SUPABASE_URL
          und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const p = await searchParams;
  const ansicht = (["terminal", "monty", "jetzt", "rueckblick", "bilanz"] as const)
    .find((a) => a === einer(p.ansicht)) ?? "terminal";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Confluences</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Fünf fundamentale Faktoren als Filter — nicht als Einstieg. Der Einstieg
          bleibt die GVA-Linie am Chart; hier steht nur, ob die Lage dafür oder
          dagegen sprach.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {ANSICHTEN.map((a) => (
          <Link key={a.key} href={`/trading/confluence?ansicht=${a.key}`}
            title={a.hinweis}
            className={cx(
              "rounded-xl px-3.5 py-1.5 text-sm transition duration-150 ease-tactile active:scale-95",
              ansicht === a.key
                ? "bg-accent font-medium text-ink-on shadow-glow-accent"
                : "border border-line bg-sand text-ink-muted hover:text-ink")}>
            {a.label}
          </Link>
        ))}
      </nav>

      <Suspense key={ansicht + JSON.stringify(p)} fallback={<Laedt />}>
        {ansicht === "terminal" ? <AnsichtTerminal />
          : ansicht === "monty" ? <AnsichtMonty p={p} />
            : ansicht === "jetzt" ? <AnsichtJetzt />
              : ansicht === "rueckblick" ? <AnsichtRueckblick p={p} />
                : <AnsichtBilanz />}
      </Suspense>
    </div>
  );
}

function Laedt() {
  return (
    <Card>
      <div className="py-10 text-center text-sm text-ink-muted">
        Zinsen, Inflation, COT und Marktdaten werden geholt …
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- Terminal */

/**
 * Der Blick, um den es Kerim eigentlich geht: acht Währungen, 28 Paare, und
 * die Frage „wo lohnt sich heute überhaupt der Chart".
 *
 * Bewusst ohne eine einzige Rohzahl. Die stehen einen Klick weiter unter
 * „Jetzt" — hier würden sie nur davon ablenken, dass am Ende drei Farben
 * die ganze Aussage sind.
 */
async function AnsichtTerminal() {
  const heute = heuteISO();
  const { regime, paare, waehrungen, matrix, handelbar, bericht } = await baueJetzt(heute);

  const stufen = paare.map((u) => ampelFuer(u).stufe);
  const zaehle = (s: string) => stufen.filter((x) => x === s).length;

  return (
    <>
      <Card>
        <CardTitle>Terminal — Stand {heute}</CardTitle>
        <RegimeKarte regime={regime} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {([
            ["handelbar", zaehle("gruen"), "text-good-bright"],
            ["nur mit gutem Chart", zaehle("gelb"), "text-warn"],
            ["nicht aus der Lage", zaehle("rot"), "text-ink-faint"],
          ] as [string, number, string][]).map(([label, n, farbe]) => (
            <div key={label} className="rounded-xl bg-sand/50 px-2 py-2.5">
              <div className={cx("num text-lg font-semibold", farbe)}>{n}</div>
              <div className="text-[11px] text-ink-muted">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardTitle>Wer steht wo</CardTitle>
          <WaehrungsLeiste waehrungen={waehrungen} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Der Score ist der Durchschnitt der sieben Netto-Werte einer Währung,
            auf sie gedreht — nicht „in wie vielen Paaren liegt sie vorne",
            sondern wie deutlich. Rechts steht dafür/dagegen; „strittig" heisst,
            dass die Währung gegen manche stark und gegen andere schwach ist.
            Dann ist der Score ein Mittelwert über zwei verschiedene Geschichten
            und taugt nur als Sortierung, nicht als Urteil.
          </p>
        </Card>

        <Card>
          <CardTitle>Heute handelbar</CardTitle>
          <HandelbarListe handelbar={handelbar} />
        </Card>
      </div>

      <Card>
        <CardTitle>Alle Paare auf einen Blick</CardTitle>
        <PaarMatrix matrix={matrix} />
      </Card>

      <Luecken leer={bericht.leer} cotQuelle={bericht.cotQuelle} />
    </>
  );
}

/* ------------------------------------------------------------- Monty */

/**
 * Monty: nur das, was Kerim tatsächlich benutzt.
 *
 * Commercials gegen Retail und Saisonalität — kein Zins, keine Inflation, kein
 * Risiko-Regime. Die Seite beantwortet zwei Fragen: wo stehen die grossen
 * Halter gerade gegen die Kleinen, und was hat dieser Kalendermonat in der
 * Vergangenheit getan.
 */
async function AnsichtMonty({ p }: { p: Record<string, string | string[] | undefined> }) {
  const heute = heuteISO();
  const fenster: Fenster = FENSTER.find((f) => String(f) === einer(p.jahre)) ?? 20;
  const cot = await baueMontyCot(heute);

  return (
    <>
      <Card>
        <CardTitle>Commercials gegen Retail — Stand {heute}</CardTitle>
        <CotStatistikTabelle zeilen={cot.waehrungen} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          <strong>Gestreckt</strong> heisst: Commercials und Nicht-Meldepflichtige stehen
          gleichzeitig an entgegengesetzten Rändern ihrer eigenen drei Jahre. Die Richtung
          folgt den Commercials. Die Spalte daneben sagt, wie oft das in den letzten drei
          Jahren überhaupt vorkam — steht dort ein hoher Anteil, ist die Streckung kein
          Extrem, sondern der Normalzustand.
        </p>
        <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
          <strong>Warum nicht einfach „die zeigen auseinander":</strong> im COT gilt netto
          <em> Commercials ≈ −(Grossspekulanten + Retail)</em>. Sie stehen fast immer gegen
          Retail, weil jemand die Gegenseite halten muss. Ein Filter auf das blosse
          Vorzeichen hätte in neun von zehn Wochen zugestimmt — das ist Buchhaltung, kein
          Signal. „Retail" sind hier ausserdem die Kleinspekulanten am{" "}
          <strong>Termin</strong>markt, nicht CFD-Retail; ein Proxy, dafür mit Jahrzehnten
          Historie.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle className="mb-0">Saisonalität — alle 28 Paare</CardTitle>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {FENSTER.map((f) => (
              <Link key={f} href={`/trading/confluence?ansicht=monty&jahre=${f}`}
                className={cx("num rounded-lg px-2.5 py-1 text-xs transition duration-150 ease-tactile",
                  fenster === f ? "bg-sand text-ink" : "text-ink-muted hover:text-ink")}>
                {f} Jahre
              </Link>
            ))}
          </span>
        </div>

        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <SaisonKopf />
            <tbody>
              {MONTY_PAARE.map((paar) => (
                <Suspense key={paar} fallback={<SaisonZeileLaedt paar={paar} />}>
                  {/* Jede Zeile laedt ihre eigenen Kurse: 28 Paare mal rund 5000
                      Tageskerzen waeren in einem Zug 140 000 Zeilen. So fuellt sich
                      die Tabelle Paar fuer Paar, statt in den Timeout zu laufen.
                      Nach dem ersten Aufruf sind die Kurse 24 h gecacht. */}
                  <SaisonZeilenLader paar={paar} fenster={fenster} heute={heute} />
                </Suspense>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Die Zahl ist der <strong>Median</strong> der Monatsrenditen in Prozent, nicht
          der Durchschnitt: ein einziges Ausreisserjahr verschiebt den Durchschnitt, den
          Median nicht. Farbig ist ein Monat nur, wenn er <strong>belegt</strong> ist -
          das Wilson-Intervall seiner Trefferquote darf die 50 % nicht enthalten. Sieben
          von zehn positiven Jahren sehen deutlich aus und sind es nicht.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Mindestens {MIN_JAHRE} bewegte Jahre je Monat, sonst bleibt das Feld blass.
          Jahre ganz ohne Bewegung zaehlen in keine Richtung - kein Ergebnis ist kein
          Verlust. Weiter als {MAX_JAHRE} Jahre zurueck geht es nicht: OANDA liefert
          hoechstens 5000 Tageskerzen je Instrument.
        </p>
      </Card>
    </>
  );
}

/** Eine Zeile der Saison-Matrix - eigene Komponente, damit Suspense greift. */
async function SaisonZeilenLader({ paar, fenster, heute }: {
  paar: string; fenster: Fenster; heute: string;
}) {
  const bild = await baueSaisonZeile(paar, fenster, heute);
  return <SaisonZeile bild={bild} />;
}

/* ------------------------------------------------------------- Jetzt */

async function AnsichtJetzt() {
  const heute = heuteISO();
  const { regime, paare, waehrungen, bericht } = await baueJetzt(heute);

  const deutlich = paare.filter((u) => u.richtung !== 0 && Math.abs(u.netto) >= 0.2);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardTitle>Lage am {heute}</CardTitle>
          <RegimeKarte regime={regime} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {([
              ["deutlich", deutlich.length],
              ["ohne Aussage", paare.filter((x) => x.richtung === 0).length],
              ["mit Veto", paare.filter((x) => x.veto.gegen !== 0).length],
            ] as [string, number][]).map(([label, n]) => (
              <div key={label} className="rounded-xl bg-sand/50 px-2 py-2.5">
                <div className="num text-lg font-semibold text-ink">{n}</div>
                <div className="text-[11px] text-ink-muted">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            „Deutlich" heisst: die gerichteten Faktoren zeigen zusammen ein Netto
            von mindestens 0.20. Bei 28 Paaren ist es normal, dass die Mehrheit
            nichts sagt — genau dafür ist ein Filter da.
          </p>
        </Card>

        <Card>
          <CardTitle>Währungen — Werte, Aktualität, Einigkeit</CardTitle>
          <WaehrungsTabelle waehrungen={waehrungen} />
        </Card>
      </div>

      <Card>
        <CardTitle>Alle 28 Paare</CardTitle>
        <PaarTabelle paare={paare} />
        <p className="mt-3 text-[11px] text-ink-faint">
          Klick auf ein Paar öffnet den Rückblick. Über den Pfeilen steht der
          Begründungssatz als Tooltip.
        </p>
      </Card>

      <Luecken leer={bericht.leer} cotQuelle={bericht.cotQuelle} />
    </>
  );
}

/* ------------------------------------------------------------- Rückblick */

async function AnsichtRueckblick({ p }: { p: Record<string, string | string[] | undefined> }) {
  const heute = heuteISO();
  const paarRoh = (einer(p.paar) ?? "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");
  const paar = (PAARE as readonly string[]).includes(paarRoh) ? paarRoh : "EURUSD";
  const datumRoh = einer(p.datum) ?? heute;
  // Ein Datum in der Zukunft ergibt kein As-of - dann gilt heute.
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(datumRoh) && datumRoh <= heute ? datumRoh : heute;
  const richtungRoh = einer(p.richtung);
  const richtung: -1 | 0 | 1 = richtungRoh === "long" ? 1 : richtungRoh === "short" ? -1 : 0;

  const { urteil, regime, labor, bericht, eigeneTrades } =
    await baueRueckblick(paar, datum, richtung);

  return (
    <>
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="ansicht" value="rueckblick" />
          <div>
            <Label htmlFor="datum">Handelstag</Label>
            <Input id="datum" name="datum" type="date" defaultValue={datum} max={heute}
              className="w-44" />
          </div>
          <div>
            <Label htmlFor="paar">Paar</Label>
            <Select id="paar" name="paar" defaultValue={paar} className="w-36">
              {PAARE.map((x) => (
                <option key={x} value={x}>{x.slice(0, 3)}/{x.slice(3)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="richtung">Richtung</Label>
            <Select id="richtung" name="richtung"
              defaultValue={richtung > 0 ? "long" : richtung < 0 ? "short" : ""}
              className="w-36">
              <option value="">— egal —</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
          <Button type="submit" className="mb-0">Nachsehen</Button>
        </form>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Gerechnet wird mit dem Stand <strong>dieses Tages</strong>, inklusive
          Veröffentlichungsverzug: eine Inflationszahl mit Stichtag 1. März gilt
          hier erst ab Mitte April, weil sie vorher niemand kennen konnte. Ohne
          diese Regel würde der Rückblick jeden Trade nachträglich schönrechnen.
        </p>
      </Card>

      <Card>
        <UrteilKarte u={urteil} />
        <ul className="mt-3 space-y-2">
          {urteil.faktoren.map((f) => <FaktorZeile key={f.key} f={f} />)}
          <VetoZeile v={urteil.veto} gefragt={urteil.gefragt} />
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Marktumfeld an diesem Tag</CardTitle>
          <RegimeKarte regime={regime} />
        </Card>

        <Card>
          <CardTitle>Zweitmeinung aus dem Labor</CardTitle>
          {labor ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={labor.richtung === "LONG" ? "good" : labor.richtung === "SHORT" ? "bad" : "neutral"}>
                  {labor.richtung ?? "keine Richtung"}
                </Badge>
                <span className="num text-xs text-ink-muted">
                  {labor.einig} Faktoren einig · Woche ab {labor.woche}
                </span>
                <Badge tone={labor.quelle === "live" ? "good" : "warn"}>
                  {labor.quelle === "live" ? "live eingefroren" : "rekonstruiert"}
                </Badge>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {labor.faktoren.map((f) => (
                  <li key={f.name} className="text-xs leading-relaxed text-ink-muted">
                    <span className={cx("mr-1.5 font-medium",
                      f.dir > 0 ? "text-good-bright" : f.dir < 0 ? "text-bad-bright" : "text-ink-faint")}>
                      {f.dir > 0 ? "▲" : f.dir < 0 ? "▼" : "–"} {f.name}:
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                Das Labor rechnet mit fünf Faktoren, unter anderem Saisonalität, und
                seine rekonstruierten Wochen haben ein bekanntes Lookahead-Problem.
                Deshalb steht das hier <strong>neben</strong> dem Urteil und nicht
                darin — interessant vor allem dort, wo beide dasselbe sagen.
              </p>
            </>
          ) : (
            <Empty>
              Für diese Woche gibt es keinen Labor-Snapshot. Die Tabelle
              `weekly_outlook_snapshots` wird vom Screener befüllt.
            </Empty>
          )}
        </Card>
      </div>

      {eigeneTrades.length > 0 && (
        <Card>
          <CardTitle>Deine Trades auf {paar} an diesem Tag</CardTitle>
          <ul className="space-y-2">
            {eigeneTrades.map((t) => {
              const passt = richtung === 0 || t.richtung === richtung;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-sand/50 px-3 py-2 text-sm">
                  <Badge tone={t.richtung > 0 ? "good" : "bad"}>
                    {t.richtung > 0 ? "LONG" : "SHORT"}
                  </Badge>
                  <span className="text-ink-soft">{t.ergebnis ?? "offen"}</span>
                  <span className="num text-ink-muted">
                    {t.r > 0 ? "+" : ""}{t.r.toFixed(2)} R
                  </span>
                  {!passt && (
                    <span className="text-xs text-ink-faint">
                      — das Urteil oben gilt für die andere Richtung
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Luecken leer={bericht.leer} cotQuelle={bericht.cotQuelle} />
    </>
  );
}

/* ------------------------------------------------------------- Bilanz */

async function AnsichtBilanz() {
  const b = await baueBilanz();

  if (b.ausgewertet === 0) {
    return (
      <Card>
        <CardTitle>Bilanz</CardTitle>
        <Empty>
          Noch keine abgeschlossenen Trades im Journal. Sobald Trades mit
          Ergebnis erfasst sind, wird hier gerechnet, ob Rückenwind bei
          <em> deinen</em> Einstiegen etwas ausgemacht hat.
        </Empty>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardTitle>Rückenwind gegen Gegenwind</CardTitle>
        <BefundKarte v={b.vergleich} />
        <div className="mt-4"><GruppenTabelle gruppen={b.gruppen} /></div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          {b.ausgewertet} ausgewertete Trades von {b.von} bis {b.bis}
          {b.uebersprungen > 0 && ` · ${b.uebersprungen} ohne Ergebnis übersprungen`}.
          Jeder Trade wurde mit dem Stand <strong>seines</strong> Handelstages
          bewertet. Das ist der einzige Test der Confluence-Idee, der mit dieser
          Datenlage aussagekräftig werden kann: gepaart, gleiche Methode, gleicher
          Zeitraum — nur einmal mit und einmal ohne fundamentalen Rückenwind.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Trennt der Filter überhaupt?</CardTitle>
          <VerteilungKarte verteilung={b.verteilung} gesamt={b.ausgewertet} />
        </Card>
        <Card>
          <CardTitle>Das Veto</CardTitle>
          <VetoKarte v={b.veto} />
        </Card>
      </div>

      <Card>
        <CardTitle>Alle bewerteten Trades</CardTitle>
        <TradeListe trades={b.trades} />
      </Card>

      {b.bericht && <Luecken leer={b.bericht.leer} cotQuelle={b.bericht.cotQuelle} />}
    </>
  );
}
