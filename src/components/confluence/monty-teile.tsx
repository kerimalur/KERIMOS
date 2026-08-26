import { Badge, cx } from "@/components/ui";
import { Intervall } from "@/components/confluence/bilanz-teile";
import { MONATS_KURZ, MIN_JAHRE, type SaisonBild } from "@/lib/confluence/saison";
import { HAEUFIG_AB, type CotStatistik } from "@/lib/confluence/monty-cot";
import type { CotPaarZeile } from "@/lib/confluence/cot-divergenz";

/**
 * Anzeigebausteine für Monty.
 *
 * Beide Tabellen folgen derselben Regel: eine Zahl wird nur dann hervorgehoben,
 * wenn sie belegt ist. Alles andere bleibt blass. Eine Saison-Matrix, in der
 * 336 Felder um Aufmerksamkeit buhlen, ist eine Tapete — hervorgehoben sind
 * hier typischerweise ein paar Dutzend.
 */

/* ------------------------------------------------------------- COT */

export function CotStatistikTabelle({ zeilen }: { zeilen: CotStatistik[] }) {
  const rang = (v: number | null) => (v === null ? "·" : v.toFixed(0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 text-left font-normal">Währung</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Perzentilrang der Commercials über drei Jahre">Commercials</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Perzentilrang der Nicht-Meldepflichtigen (Retail-Proxy)">Retail</th>
            <th className="px-2 py-2 text-center font-normal">jetzt</th>
            <th className="px-2 py-2 text-right font-normal">gestreckt</th>
            <th className="px-2 py-2 text-right font-normal">dafür / dagegen</th>
            <th className="px-2 py-2 text-right font-normal"
              title="Längste ununterbrochene Streckung">längste</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.ccy} className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
              <td className="px-2 py-2 font-medium text-ink">{z.ccy}</td>
              <td className={cx("num px-2 py-2 text-right",
                z.jetzt.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                {rang(z.jetzt.kommRang)}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                z.jetzt.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                {rang(z.jetzt.retailRang)}
              </td>
              <td className="px-2 py-2 text-center">
                {z.jetzt.divergenz === 0
                  ? <span className="text-ink-faint">–</span>
                  : (
                    <Badge tone={z.jetzt.divergenz > 0 ? "good" : "bad"}>
                      {z.jetzt.divergenz > 0 ? "gestützt" : "belastet"}
                    </Badge>
                  )}
              </td>
              <td className={cx("num px-2 py-2 text-right",
                (z.anteil ?? 0) > HAEUFIG_AB ? "text-warn" : "text-ink-soft")}
                title={z.satz}>
                {z.anteil === null ? "·" : `${(z.anteil * 100).toFixed(0)} %`}
                <span className="ml-1 text-[11px] text-ink-faint">
                  {z.gestreckt}/{z.termine}
                </span>
              </td>
              <td className="num px-2 py-2 text-right text-ink-soft">
                <span className="text-good-bright">{z.dafuer}</span>
                <span className="text-ink-faint"> / </span>
                <span className="text-bad-bright">{z.dagegen}</span>
              </td>
              <td className="num px-2 py-2 text-right text-ink-muted">{z.laengste}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- Saison-Matrix */

/** Kopfzeile der Matrix — steht einmal über allen Paar-Zeilen. */
export function SaisonKopf() {
  return (
    <thead className="sticky top-0 bg-card">
      <tr className="border-b border-line text-xs text-ink-muted">
        <th className="px-2 py-2 text-left font-normal">Paar</th>
        {MONATS_KURZ.map((m) => (
          <th key={m} className="px-1 py-2 text-center font-normal">{m}</th>
        ))}
        <th className="px-2 py-2 text-right font-normal"
          title="Wie viele der zwölf Monate statistisch belegt sind">belegt</th>
        <th className="px-2 py-2 text-right font-normal">Jahre</th>
      </tr>
    </thead>
  );
}

/** Platzhalter, solange die Kurse eines Paares laden. */
export function SaisonZeileLaedt({ paar }: { paar: string }) {
  return (
    <tr className="border-b border-line/50">
      <td className="px-2 py-2 text-ink-faint">{paar.slice(0, 3)}/{paar.slice(3)}</td>
      <td colSpan={14} className="px-2 py-2 text-[11px] text-ink-faint">lädt …</td>
    </tr>
  );
}

export function SaisonZeile({ bild }: { bild: SaisonBild }) {
  return (
    <tr className="border-b border-line/50 last:border-b-0 hover:bg-sand/40">
      <td className="px-2 py-2 text-ink">
        {bild.paar.slice(0, 3)}/{bild.paar.slice(3)}
      </td>
      {bild.monate.map((m) => {
        const wert = m.median ?? m.schnitt;
        return (
          <td key={m.monat} className="px-0.5 py-1 text-center"
            title={m.quote.n < MIN_JAHRE
              ? `${MONATS_KURZ[m.monat - 1]}: nur ${m.quote.n} bewegte Jahre — zu wenig`
              : `${MONATS_KURZ[m.monat - 1]}: ${m.quote.treffer} von ${m.quote.n} Jahren positiv`
                + `, Median ${m.median?.toFixed(2) ?? "·"} %`
                + `, Schnitt ${m.schnitt?.toFixed(2) ?? "·"} %`
                + `, Spanne ${m.schlechtestes?.toFixed(1) ?? "·"} bis ${m.bestes?.toFixed(1) ?? "·"} %`
                + (m.flach > 0 ? `, ${m.flach} flach` : "")
                + (m.belegt ? " — belegt" : " — nicht belegt")}>
            <span className={cx(
              "num inline-block w-11 rounded px-0.5 py-1 text-[11px]",
              m.belegt
                ? (m.richtung > 0 ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright")
                : "text-ink-faint",
            )}>
              {wert === null ? "·" : `${wert > 0 ? "+" : ""}${wert.toFixed(1)}`}
            </span>
          </td>
        );
      })}
      <td className={cx("num px-2 py-2 text-right",
        bild.belegte > 0 ? "text-ink" : "text-ink-faint")}>
        {bild.belegte}
      </td>
      <td className="num px-2 py-2 text-right text-ink-muted">{bild.jahreVorhanden}</td>
    </tr>
  );
}

/* ------------------------------------------------- COT je Paar */

/**
 * Dieselbe Lage, nur auf Paarebene.
 *
 * Zwei Spalten mit einem Urteil, und das ist Absicht: **beide Beine** rechnet
 * der Screener (Basis minus Quote), **nur Basis** rechnet Kerims
 * Pine-Indikator — und so zeigt es TradingView, weil es kein
 * „EURUSD"-Terminkontrakt gibt, sondern nur den auf den Euro.
 *
 * Strittige Zeilen stehen oben und sind markiert. Sie sind kein Fehler,
 * sondern der Grund für diese Tabelle: stehen beide Währungen gleich
 * gestreckt, hebt sich die Differenz auf und der Screener sagt nichts,
 * während der Indikator ein Signal zeigt. Wer das nicht weiss, hält eines
 * von beiden für kaputt.
 */
export function CotPaarTabelle({ zeilen }: {
  zeilen: {
    paar: string;
    urteil: { dir: -1 | 0 | 1; staerke: number; text: string;
      basis: { ccy: string; kommRang: number | null; retailRang: number | null; divergenz: -1 | 0 | 1 };
      quote: { ccy: string; kommRang: number | null; retailRang: number | null; divergenz: -1 | 0 | 1 } };
    nurBasis: -1 | 0 | 1;
    widerspruch: boolean;
  }[];
}) {
  const rang = (v: number | null) => (v === null ? "·" : v.toFixed(0));
  const seite = (d: -1 | 0 | 1) =>
    d === 0 ? <span className="text-ink-faint">–</span>
      : <Badge tone={d > 0 ? "good" : "bad"}>{d > 0 ? "long" : "short"}</Badge>;

  const mitAussage = zeilen.filter((z) => z.urteil.dir !== 0 || z.nurBasis !== 0);
  const strittig = zeilen.filter((z) => z.widerspruch).length;

  if (mitAussage.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Kein einziges der 28 Paare hat gerade eine Aussage — weder über beide
        Beine noch über die Basiswährung allein. Das ist ein normaler Zustand
        und keine Datenlücke: die Streckung ist selten, sonst wäre sie keine.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="px-2 py-2 text-left font-normal">Paar</th>
              <th className="px-2 py-2 text-right font-normal"
                title="Commercials / Retail der Basiswährung">Basis C/R</th>
              <th className="px-2 py-2 text-right font-normal"
                title="Commercials / Retail der Quotewährung">Quote C/R</th>
              <th className="px-2 py-2 text-center font-normal"
                title="Basis minus Quote — so rechnet der Screener">beide Beine</th>
              <th className="px-2 py-2 text-center font-normal"
                title="Nur die Basiswährung — so rechnet dein Pine und so zeigt es TradingView">
                nur Basis
              </th>
            </tr>
          </thead>
          <tbody>
            {mitAussage.map((z) => (
              <tr key={z.paar}
                className={cx("border-b border-line/50 last:border-b-0 hover:bg-sand/40",
                  z.widerspruch && "bg-warn-tint/40")}>
                <td className="px-2 py-2 font-medium text-ink">
                  {z.paar}
                  {z.widerspruch && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-warn">
                      strittig
                    </span>
                  )}
                </td>
                <td className={cx("num px-2 py-2 text-right",
                  z.urteil.basis.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                  {rang(z.urteil.basis.kommRang)} / {rang(z.urteil.basis.retailRang)}
                </td>
                <td className={cx("num px-2 py-2 text-right",
                  z.urteil.quote.divergenz !== 0 ? "text-ink" : "text-ink-soft")}>
                  {rang(z.urteil.quote.kommRang)} / {rang(z.urteil.quote.retailRang)}
                </td>
                <td className="px-2 py-2 text-center" title={z.urteil.text}>
                  {seite(z.urteil.dir)}
                  {z.urteil.dir !== 0 && z.urteil.staerke < 1 && (
                    <span className="ml-1 text-[10px] text-ink-faint">halb</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">{seite(z.nurBasis)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        {mitAussage.length} von {zeilen.length} Paaren haben überhaupt eine
        Aussage
        {strittig > 0 && (
          <>
            , davon <strong className="text-warn">{strittig} strittig</strong>
          </>
        )}
        . Paare ohne jede Aussage stehen gar nicht erst da.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        <strong>strittig</strong> heisst: die zwei Spalten sagen nicht
        dasselbe. Drei Arten, wie das passiert —
        {" "}<em>gegenläufig</em> (beide sprechen, in verschiedene Richtungen),
        {" "}<em>ausgelöscht</em> (beide Währungen gleich gestreckt, die
        Differenz ist null, nur die Basis spricht) und
        {" "}<em>nur Quote</em> (das Signal kommt allein vom Gegenbein, die
        Basis schweigt — dann zeigt TradingView nichts).
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        <strong>halb</strong> heisst: nur eine der beiden Währungen ist
        gestreckt. Volle Stärke gibt es nur, wenn beide Seiten am Rand stehen
        und in dieselbe Richtung zeigen.
      </p>
      <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
        <strong>Für den Vergleich mit TradingView:</strong> nimm die Spalte
        „nur Basis". TradingView zeigt den Terminkontrakt der Währung, nicht
        des Paares — einen EURUSD-Kontrakt gibt es nicht. Bei
        USD-Quote-Paaren ist das die linke Währung, bei USD-Basis-Paaren
        (USDJPY, USDCAD, USDCHF) der <strong>Dollar-Index</strong>, CFTC
        098662. Weichen die Perzentile trotzdem ab, liegt es fast immer an
        einer der drei Stellen: anderes Fenster als drei Jahre, netto statt
        Anteil am Open Interest, oder ein Bericht Versatz.
      </p>
    </>
  );
}

/* ------------------------------------------- COT je Paar, gezeichnet */

/**
 * Alle 28 Paare als Balken — Commercials gegen Retail, stetig.
 *
 * Die Tabelle daneben zeigt nur Paare mit Signal. An einem normalen Tag sind
 * das zwei oder drei, und die anderen 25 sieht man gar nicht. Man weiss dann
 * nicht, ob dort nichts los ist oder ob es knapp war — und das ist ein
 * Unterschied, der beim Suchen nach einem Setup zählt.
 *
 * Gezeichnet wird die **Spanne**: Commercials-Rang minus Retail-Rang, für
 * Basis und Quote verrechnet. −100 bis +100, Mitte ist null.
 *
 * **Zur Kodierung.** Die Länge trägt die Stärke, die Richtung trägt das
 * Vorzeichen — links kurz, rechts lang. Die Farbe sagt dasselbe noch einmal
 * und ist damit Zugabe, nicht Träger: Grün und Rot liegen bei Rot-Grün-
 * Schwäche mit ΔE 7.1 dicht beieinander, und ein Balken, den man nur an der
 * Farbe lesen kann, ist für einen Teil der Leute leer. Deshalb steht die Zahl
 * daneben und das Wort dahinter.
 *
 * Sortiert nach Betrag, stärkste zuerst: man sucht, wo etwas los ist.
 */
const LANG = "#5FC2A6";
const KURZ = "#E28B72";

export function CotPaarGrafik({ zeilen }: { zeilen: CotPaarZeile[] }) {
  const mitSpanne = zeilen.filter((z) => z.spanne !== null);

  if (mitSpanne.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Keine COT-Historie geladen — dann ist hier nichts zu zeichnen. Die
        Ursache steht in der Tabelle darüber.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-0.5">
        {mitSpanne.map((z) => {
          const v = z.spanne as number;
          const links = v < 0;
          const farbe = links ? KURZ : LANG;
          // Halbe Breite je Seite: die Mitte ist null, das Ende ±100.
          const breite = Math.min(50, Math.abs(v) / 2);
          const rang = (n: number | null) => (n === null ? "·" : n.toFixed(0));
          const b = z.urteil.basis, q = z.urteil.quote;
          const legenden =
            `${b.ccy} ${rang(b.kommRang)}/${rang(b.retailRang)} · ` +
            `${q.ccy} ${rang(q.kommRang)}/${rang(q.retailRang)}`;

          return (
            <li key={z.paar}
              title={`${z.paar} — Commercials/Retail: ${legenden}. ${z.urteil.text}`}
              className="grid grid-cols-[64px_minmax(0,1fr)_58px] items-center gap-2
                         rounded-lg px-1.5 py-1 hover:bg-sand/40
                         sm:grid-cols-[64px_150px_minmax(0,1fr)_58px_60px]">
              <span className="truncate text-xs font-medium text-ink">
                {z.paar}
                {z.widerspruch && <span className="ml-1 text-warn" title="strittig">*</span>}
              </span>

              <span className="num hidden text-[11px] text-ink-faint sm:block">
                {legenden}
              </span>

              {/* Der Balken. Nullpunkt in der Mitte, damit long und short
                  auf einen Blick auseinandergehen — eine Skala von links
                  nach rechts würde „schwach short" neben „schwach long"
                  legen und sie gleich aussehen lassen. */}
              <span className="relative block h-3 rounded bg-sand">
                {/* Über dem Balken, nicht darunter: die Null ist der
                    Bezugspunkt der ganzen Zeile und muss auch dann zu sehen
                    sein, wenn ein langer Balken sie überdeckt. */}
                <span aria-hidden
                  className="absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-ink-faint/70" />
                <span className="absolute inset-y-0.5 rounded-sm transition-[width]"
                  style={{
                    background: farbe,
                    width: `${breite}%`,
                    left: links ? `${50 - breite}%` : "50%",
                    // Eine Spanne von 2 wäre sonst unsichtbar und sähe aus
                    // wie gar keine Angabe.
                    minWidth: Math.abs(v) > 0.5 ? 2 : 0,
                  }} />
                {/* Das Signal, wenn die 75/25-Regel wirklich greift. Ein
                    Punkt am Balkenende statt einer zweiten Farbe: sonst
                    trüge die Farbe zwei Bedeutungen gleichzeitig. */}
                {z.urteil.dir !== 0 && (
                  <span aria-hidden
                    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-card"
                    style={{
                      background: farbe,
                      left: links ? `${50 - breite}%` : `${50 + breite}%`,
                      marginLeft: links ? -4 : -4,
                    }} />
                )}
              </span>

              <span className="num text-right text-xs"
                style={{ color: Math.abs(v) < 8 ? undefined : farbe }}>
                {v > 0 ? "+" : ""}{v.toFixed(0)}
              </span>

              <span className="hidden text-right text-[11px] sm:block">
                {z.urteil.dir === 0
                  ? <span className="text-ink-faint">—</span>
                  : <span style={{ color: farbe }}>
                      {z.urteil.dir > 0 ? "long" : "short"}
                      {z.urteil.staerke < 1 && <span className="text-ink-faint"> halb</span>}
                    </span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: KURZ }} />
          short — Commercials tief, Retail hoch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: LANG }} />
          long — Commercials hoch, Retail tief
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink-muted" />
          Punkt = 75/25-Regel greift
        </span>
        <span><span className="text-warn">*</span> = strittig</span>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Die Zahl ist die <strong>Spanne</strong>: Commercials-Rang minus
        Retail-Rang, für Basis und Quote verrechnet, −100 bis +100. Sie zeigt
        die Lage auch dort, wo kein Signal steht — das ist der Unterschied zur
        Tabelle darüber, die nur Paare mit Signal kennt. Ein Balken ohne Punkt
        heisst: es geht in diese Richtung, aber mindestens eine Seite steht
        noch nicht am Rand.
      </p>
      <p className="mt-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
        <strong>Was die Spanne nicht ist:</strong> ein Mass dafür, wie gut der
        Trade wird. Sie sagt, wie weit Commercials und Retail auseinanderstehen
        — nicht, ob das je etwas vorhergesagt hat. Diese Frage beantwortet nur
        die Messung über zwanzig Jahre, und die steht im Backtest unter{" "}
        <em>Rückblick → Faktor &amp; Grenze</em>.
      </p>
    </>
  );
}
