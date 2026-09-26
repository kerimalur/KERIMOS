import type { RangZeile } from "./bewertung";

/**
 * Monty gegen die drei Ebenen — stimmen sie überein?
 *
 * Seit dem 26.09.2026 ist Monty keine eigene Rangliste mehr, sondern eine
 * **Gegenprobe**. Der Grund ist derselbe, aus dem der Q-Score weg ist: zwei
 * Ranglisten nebeneinander, die dasselbe Paar einmal empfehlen und einmal
 * nicht, schaffen keine Klarheit, sondern kosten bei jedem Blick eine
 * Entscheidung, welcher man heute glaubt.
 *
 * Deshalb gilt hier eine klare Rollenverteilung:
 *
 *   Die drei Ebenen sagen, WAS gehandelt wird.
 *   Monty sagt nur, ob die Commercials dem zufällig zustimmen.
 *
 * Ein „uneinig" ist kein Verbot. Es ist der Hinweis, dass die Hedger am
 * Terminmarkt gerade anders positioniert sind als die Fundamentaldaten
 * nahelegen — was oft genau vor einer Wende passiert, und ebenso oft
 * einfach nichts heisst.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/makro.mts`.
 */

/** Was Monty je Währung liefert — die Form aus `cotBildFuer`, ohne die Texte. */
export interface CotStand {
  ccy: string;
  /** Perzentilrang der Commercials, 0…100. Null ohne genug Historie. */
  kommRang: number | null;
  /** Perzentilrang der Nicht-Meldepflichtigen (Retail-Proxy), 0…100. */
  retailRang: number | null;
  /** +1 = Commercials gestreckt long gegen Retail short, −1 umgekehrt, 0 nichts. */
  divergenz: -1 | 0 | 1;
}

export type Stand = "einig" | "uneinig" | "still" | "offen";

export interface AbgleichZeile {
  ccy: string;
  /** Rang aus den drei Ebenen (1 = stärkste). */
  rang: number;
  gesamt: number | null;
  /** +1 stark, −1 schwach, 0 im Mittelfeld — die Ebenen, auf Richtung reduziert. */
  ebenen: -1 | 0 | 1;
  divergenz: -1 | 0 | 1;
  kommRang: number | null;
  retailRang: number | null;
  stand: Stand;
  text: string;
}

export interface Abgleich {
  zeilen: AbgleichZeile[];
  einig: number;
  uneinig: number;
  /** Währungen, zu denen Monty überhaupt etwas sagt. */
  beurteilt: number;
  satz: string;
}

/**
 * Ab diesem Gesamtscore gilt eine Währung als klar stark bzw. schwach.
 *
 * Dieselbe Schwelle wie `urteilWort` für „eher stark": darunter ist die
 * Währung im Mittelfeld, und dann kann Monty ihr weder zustimmen noch
 * widersprechen — es gäbe nichts, wozu man zustimmt.
 */
export const KLAR_AB = 0.15;

const richtung = (v: number | null): -1 | 0 | 1 =>
  v === null ? 0 : v >= KLAR_AB ? 1 : v <= -KLAR_AB ? -1 : 0;

function standVon(ebenen: -1 | 0 | 1, divergenz: -1 | 0 | 1, hatCot: boolean): Stand {
  if (!hatCot) return "offen";
  if (divergenz === 0 || ebenen === 0) return "still";
  return ebenen === divergenz ? "einig" : "uneinig";
}

function textVon(z: AbgleichZeile): string {
  const ebene = z.ebenen > 0 ? "stark" : z.ebenen < 0 ? "schwach" : "im Mittelfeld";
  const komm = z.kommRang === null ? "—" : z.kommRang.toFixed(0);
  const retail = z.retailRang === null ? "—" : z.retailRang.toFixed(0);
  const stellung = `Commercials im ${komm}., Retail im ${retail}. Perzentil`;

  switch (z.stand) {
    case "offen":
      return "Keine COT-Historie — Monty sagt zu dieser Währung nichts.";
    case "still":
      return z.divergenz === 0
        ? `${stellung} — mindestens eine Seite steht nicht am Rand, also keine Gegenprobe.`
        : `Die drei Ebenen sehen ${ebene}, dazu lässt sich nicht zustimmen. ${stellung}.`;
    case "einig":
      return `Die Commercials sind auf derselben Seite: Ebenen ${ebene}, ${stellung}.`;
    default:
      return `Die Commercials stehen dagegen: Ebenen ${ebene}, ${stellung}. `
        + "Das ist kein Verbot — nur der Hinweis, dass die Hedger anders liegen.";
  }
}

/**
 * Die Gegenprobe über alle Währungen der Rangliste.
 *
 * Währungen ohne COT-Reihe fallen nicht heraus, sondern bekommen „offen".
 * Ein stiller Eintrag und eine fehlende Zeile sehen sonst gleich aus, und
 * genau diese Verwechslung hat die alte Monty-Tabelle wochenlang leer
 * aussehen lassen, obwohl die Rechnung stimmte.
 */
export function montyAbgleich(zeilen: RangZeile[], cot: CotStand[]): Abgleich {
  const jeCcy = new Map(cot.map((c) => [c.ccy, c]));

  const ergebnis: AbgleichZeile[] = zeilen.map((z) => {
    const c = jeCcy.get(z.ccy) ?? null;
    const hatCot = !!c && c.kommRang !== null && c.retailRang !== null;
    const ebenen = richtung(z.gesamt);
    const divergenz = hatCot ? (c as CotStand).divergenz : 0;

    const zeile: AbgleichZeile = {
      ccy: z.ccy,
      rang: z.rang,
      gesamt: z.gesamt,
      ebenen,
      divergenz,
      kommRang: c?.kommRang ?? null,
      retailRang: c?.retailRang ?? null,
      stand: standVon(ebenen, divergenz, hatCot),
      text: "",
    };
    return { ...zeile, text: textVon(zeile) };
  });

  const einig = ergebnis.filter((z) => z.stand === "einig").length;
  const uneinig = ergebnis.filter((z) => z.stand === "uneinig").length;
  const beurteilt = einig + uneinig;

  return {
    zeilen: ergebnis,
    einig, uneinig, beurteilt,
    satz: beurteilt === 0
      ? "Zu keiner Währung stehen Commercials und Retail gleichzeitig am Rand — "
        + "heute hat Monty zur Rangliste nichts zu sagen."
      : `${einig} von ${beurteilt} Währungen mit COT-Aussage stützen die Rangliste`
        + (uneinig === 0 ? ", keine widerspricht."
          : uneinig === 1 ? ", eine widerspricht." : `, ${uneinig} widersprechen.`),
  };
}
