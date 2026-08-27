import "server-only";
import { ladeCotLang, ladeFuerSpanne, ladeKurse } from "./daten";
import { baueRegime, bewertePaar, type RegimeLage } from "./faktoren";
import { SYNTH, synthRaengeReihe } from "./cot-synth";
import { saisonZum, type Fenster } from "./saison";
import { wilson, type Quote } from "./bilanz";
import { trennBefund } from "./auswertung";
import { plusTage } from "./reihen";
import { berechneR, type NativeBacktestTrade } from "@/lib/backtest-types";

/**
 * Die drei Zeitstrahlen der Fundamental-Auswertung.
 *
 * Der Unterschied zur Tabellensicht in `backtest-bilanz.ts` ist nicht die
 * Rechnung, sondern die Frage. Dort: „wie oft ging es gut, wenn der Faktor
 * dafür stand". Hier: „wie lief der Faktor über die Jahre — und wo genau in
 * diesem Verlauf sass mein Trade". Das Zweite kann eine Tabelle nicht zeigen,
 * das Erste kann ein Bild nicht beweisen. Deshalb steht unter jedem Zeitstrahl
 * derselbe Trenn-Befund wie in der Tabelle (`trennBefund`) — das Bild stellt
 * die Frage, der Satz beantwortet sie.
 *
 * ─── Drei Dinge, die man beim Lesen wissen muss ───
 *
 * 1. **Nur ein Paar.** Commercials, Saisonalität und Q-Score sind Aussagen
 *    über ein bestimmtes Währungspaar. Zwei Paare in einen Zeitstrahl zu
 *    legen ergäbe eine Linie, die es nirgends gibt. Über mehrere Paare läuft
 *    die Auswertung deshalb weiter über Zahlen, nicht über Bilder.
 *
 * 2. **Kein Wissen aus der Zukunft.** Die COT-Ränge tragen den
 *    Publikationsverzug (`synthRaengeReihe`), die Saisonalität sieht per
 *    `saisonZum` ausschliesslich Jahre VOR dem jeweiligen Monat. Ohne das
 *    wäre der ganze Rückblick ein Selbstbetrug.
 *
 * 3. **COT wird synthetisch gerechnet** — erst die Differenz der beiden
 *    Währungen, dann der Rang, genau wie in Kerims Pine-Indikator. Ränge zu
 *    subtrahieren wäre falsch (siehe Kopf von `cot-synth.ts`), und die
 *    Währungs-Einzelsicht aus `cot-divergenz.ts` beantwortet eine andere
 *    Frage als eine Linie über das Paar.
 */

import type {
  Linienpunkt, Monatsblock, Spur, SpurKey, ZeitstrahlBild, ZeitstrahlTrade,
} from "./zeitstrahl-typen";

export * from "./zeitstrahl-typen";

export const SPUR_TITEL: Record<SpurKey, string> = {
  cot: "Commercials gegen Retail",
  saison: "Saisonalität",
  qscore: "Confluence-Score",
};

export const SPUR_ERKLAERUNG: Record<SpurKey, string> = {
  cot: "Perzentilrang der Netto-Positionen im Paar (Basis minus Quote), gerechnet "
    + `über ${SYNTH.wochen} Wochen — dieselbe Rechnung wie im Pine-Indikator. `
    + `Ein Signal entsteht erst, wenn die Commercials über dem ${SYNTH.oben}. und `
    + `Retail unter dem ${SYNTH.unten}. Perzentil stehen (oder umgekehrt).`,
  saison: "Anteil der Aufwärtsmonate im jeweiligen Kalendermonat, in Prozentpunkten "
    + "über oder unter 50. Kräftig eingefärbt sind nur die Monate, bei denen das "
    + "Wilson-Intervall die 50 % nicht mehr enthält — der Rest ist ein Eindruck.",
  qscore: "Netto der gerichteten Fundamentalfaktoren am jeweiligen Tag, −1 bis +1, "
    + "bezogen auf das Paar. Über +0.1 spricht es für Long, unter −0.1 für Short; "
    + "dazwischen zählt es als stumm.",
};

/** Ab hier gilt der Q-Score als gerichtet — dieselbe Schwelle wie in der Bilanz. */
const QSCORE_SCHWELLE = 0.1;

/** Wie weit vor dem ersten und nach dem letzten Trade gezeichnet wird. */
const RAND_TAGE = 45;

/* ------------------------------------------------------------- Werkzeug */

const norm = (paar: string) => paar.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);

function monateZwischen(von: string, bis: string): string[] {
  const raus: string[] = [];
  let jahr = Number(von.slice(0, 4));
  let monat = Number(von.slice(5, 7));
  const jahrEnde = Number(bis.slice(0, 4));
  const monatEnde = Number(bis.slice(5, 7));
  // Harte Obergrenze: ein kaputtes Datum im Journal soll keine Endlosschleife
  // bauen, sondern einen zu kurzen Zeitstrahl.
  for (let i = 0; i < 600; i++) {
    if (jahr > jahrEnde || (jahr === jahrEnde && monat > monatEnde)) break;
    raus.push(`${jahr}-${String(monat).padStart(2, "0")}`);
    monat++;
    if (monat > 12) { monat = 1; jahr++; }
  }
  return raus;
}

const monatsEnde = (ym: string): string => {
  const [j, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
};

/** Letzter Wert der Reihe, der am Stichtag schon bekannt war. */
function standZum<T extends { datum: string }>(reihe: T[], tag: string): T | null {
  let treffer: T | null = null;
  for (const p of reihe) {
    if (p.datum > tag) break;
    treffer = p;
  }
  return treffer;
}

/* --------------------------------------------------------------- Aufbau */

export interface ZeitstrahlOptionen {
  saisonFenster?: Fenster;
}

/**
 * Baut die drei Zeitstrahlen für die Trades EINES Paares.
 *
 * Gibt `fehler` zurück statt zu werfen: eine fehlende COT-Historie oder ein
 * zweites Paar in derselben Auswahl ist kein Programmfehler, sondern eine
 * Aussage, die auf der Seite stehen soll.
 */
export async function baueZeitstrahl(
  alle: NativeBacktestTrade[],
  opt: ZeitstrahlOptionen = {},
): Promise<ZeitstrahlBild> {
  const saisonFenster: Fenster = opt.saisonFenster ?? 20;

  const brauchbar = alle.filter(
    (t) => /^\d{4}-\d{2}-\d{2}/.test(t.occurred_on ?? "") && norm(t.pair ?? "").length === 6,
  );

  const leer = (fehler: string): ZeitstrahlBild => ({
    paar: brauchbar.length > 0 ? norm(brauchbar[0].pair) : "",
    von: "", bis: "", ersterTrade: "", letzterTrade: "",
    spuren: [], trades: [], saisonFenster, fehler,
  });

  if (brauchbar.length === 0) return leer("Keine Trades mit brauchbarem Datum und Paar.");

  const paare = [...new Set(brauchbar.map((t) => norm(t.pair)))];
  if (paare.length > 1) {
    return leer(
      `Diese Auswahl enthält ${paare.length} Paare (${paare.join(", ")}). `
      + "Ein Zeitstrahl beschreibt immer genau ein Paar — bitte auf eine Session "
      + "beziehungsweise ein Paar filtern.",
    );
  }

  const paar = paare[0];
  const basis = paar.slice(0, 3);
  const quote = paar.slice(3, 6);

  const tage = brauchbar.map((t) => t.occurred_on.slice(0, 10)).sort();
  const ersterTrade = tage[0];
  const letzterTrade = tage[tage.length - 1];
  const von = plusTage(ersterTrade, -RAND_TAGE);
  const bis = plusTage(letzterTrade, RAND_TAGE);

  /* --- Spur 1: Commercials gegen Retail, synthetisch über das Paar --- */

  const lang = await ladeCotLang(bis);
  const cotReihe = synthRaengeReihe(
    lang.cotKomm[basis] ?? [], lang.cotKomm[quote] ?? [],
    lang.cotRetail[basis] ?? [], lang.cotRetail[quote] ?? [],
  ).filter((p) => p.datum >= von && p.datum <= bis);

  const cotStand = (tag: string): { komm: number; retail: number } | null => {
    const p = standZum(cotReihe.length > 0 ? cotReihe : [], tag);
    return p ? { komm: p.komm, retail: p.retail } : null;
  };

  /* --- Spur 2: Saisonalität, Monat für Monat mit dem Wissen von damals --- */

  const kurse = await ladeKurse(paar);
  const bloecke: Monatsblock[] = [];
  for (const ym of monateZwischen(von, bis)) {
    const bild = saisonZum(kurse, `${ym}-01`, saisonFenster);
    if (!bild || bild.quote.quote === null) continue;
    bloecke.push({
      von: `${ym}-01`,
      bis: monatsEnde(ym),
      wert: (bild.quote.quote - 0.5) * 100,
      belegt: bild.belegt,
      n: bild.quote.n,
      median: bild.median,
    });
  }
  const blockZu = (tag: string) =>
    bloecke.find((b) => tag >= b.von && tag <= b.bis) ?? null;
  // Aus den Blöcken eine Treppe machen: so lässt sich die Saison mit derselben
  // Linien-Mechanik zeichnen wie die anderen beiden Spuren.
  const saisonLinie: Linienpunkt[] = bloecke.flatMap((b) => [
    { datum: b.von, wert: b.wert },
    { datum: b.bis, wert: b.wert },
  ]);

  /* --- Spur 3: Confluence-Score, wöchentlich über die Spanne --- */

  const { daten } = await ladeFuerSpanne(von, bis);
  const regimeJeTag = new Map<string, RegimeLage>();
  const regimeFuer = (tag: string) => {
    let r = regimeJeTag.get(tag);
    if (!r) { r = baueRegime(daten, tag); regimeJeTag.set(tag, r); }
    return r;
  };
  const nettoZum = (tag: string) => bewertePaar(daten, paar, tag, regimeFuer(tag)).netto;

  const qLinie: Linienpunkt[] = [];
  // Wochenschritt statt Tagesschritt: die Quellen sind monatlich bis wöchentlich,
  // eine Tageslinie wäre dieselbe Information in siebenfacher Auflösung — und
  // über sechs Jahre rund 2200 Auswertungen statt 320.
  for (let tag = von; tag <= bis; tag = plusTage(tag, 7)) {
    qLinie.push({ datum: tag, wert: nettoZum(tag) });
  }
  const qLeer = qLinie.every((p) => p.wert === 0);

  /* ------------------------------------------------- Trades einordnen */

  const trades: ZeitstrahlTrade[] = brauchbar.map((t) => {
    const tag = t.occurred_on.slice(0, 10);
    const richtung: -1 | 1 = t.direction === "short" ? -1 : 1;

    const c = cotStand(tag);
    const cotDir: -1 | 0 | 1 = !c ? 0
      : c.komm >= SYNTH.oben && c.retail <= SYNTH.unten ? 1
        : c.komm <= SYNTH.unten && c.retail >= SYNTH.oben ? -1
          : 0;

    const b = blockZu(tag);
    const saisonDir: -1 | 0 | 1 = !b || !b.belegt ? 0 : b.wert > 0 ? 1 : -1;

    const netto = qLeer ? null : nettoZum(tag);
    const qDir: -1 | 0 | 1 = netto === null ? 0
      : netto >= QSCORE_SCHWELLE ? 1 : netto <= -QSCORE_SCHWELLE ? -1 : 0;

    return {
      id: t.id,
      datum: tag,
      richtung,
      ergebnis: t.result,
      r: t.r_multiple ?? berechneR(t.result, t.rr_geplant),
      werte: {
        cot: c ? c.komm : null,
        saison: b ? b.wert : null,
        qscore: netto,
      },
      stand: {
        cot: (cotDir * richtung) as -1 | 0 | 1,
        saison: (saisonDir * richtung) as -1 | 0 | 1,
        qscore: (qDir * richtung) as -1 | 0 | 1,
      },
    };
  }).sort((a, b2) => a.datum.localeCompare(b2.datum));

  /* ------------------------------------------------------- Befund je Spur */

  // Skips haben kein Ergebnis, das sich einer Lage zuordnen liesse — sie
  // stehen als hohle Punkte im Bild, zählen aber in keine Quote.
  const gewertet = trades.filter((t) => t.ergebnis !== "skip" && t.r !== null);

  const quoteVon = (liste: ZeitstrahlTrade[]): Quote =>
    wilson(liste.filter((t) => (t.r ?? 0) > 0).length,
      liste.filter((t) => (t.r ?? 0) !== 0).length);

  function baueSpur(
    key: SpurKey,
    teile: Pick<Spur, "min" | "max" | "mitte" | "schwelleOben" | "schwelleUnten"
      | "einheit" | "linie" | "gegenLinie" | "linieTitel" | "gegenTitel" | "bloecke" | "luecke">,
  ): Spur {
    const dafuer = quoteVon(gewertet.filter((t) => t.stand[key] > 0));
    const dagegen = quoteVon(gewertet.filter((t) => t.stand[key] < 0));
    const { satz, getrennt } = trennBefund(dafuer, dagegen);
    return {
      key,
      titel: SPUR_TITEL[key],
      erklaerung: SPUR_ERKLAERUNG[key],
      dafuer, dagegen,
      stumm: gewertet.filter((t) => t.stand[key] === 0).length,
      befund: satz,
      getrennt,
      ...teile,
    };
  }

  const saisonMax = Math.max(20, ...bloecke.map((b) => Math.abs(b.wert)));
  const qMax = Math.max(0.3, ...qLinie.map((p) => Math.abs(p.wert)));

  const spuren: Spur[] = [
    baueSpur("cot", {
      min: 0, max: 100, mitte: 50,
      schwelleOben: SYNTH.oben, schwelleUnten: SYNTH.unten,
      einheit: "Perzentil",
      linie: cotReihe.map((p) => ({ datum: p.datum, wert: p.komm })),
      gegenLinie: cotReihe.map((p) => ({ datum: p.datum, wert: p.retail })),
      linieTitel: "Commercials",
      gegenTitel: "Retail (Nicht-Meldepflichtige)",
      bloecke: null,
      luecke: cotReihe.length === 0
        ? `Für ${basis} oder ${quote} liegen keine ${SYNTH.wochen} Wochen COT-Historie vor — `
          + "ohne Rangfenster gibt es keine Linie."
        : null,
    }),
    baueSpur("saison", {
      min: -saisonMax, max: saisonMax, mitte: 0,
      schwelleOben: null, schwelleUnten: null,
      einheit: "Pp. über 50 %",
      linie: saisonLinie,
      gegenLinie: null,
      linieTitel: `Aufwärtsmonate, ${saisonFenster} Jahre`,
      gegenTitel: null,
      bloecke,
      luecke: bloecke.length === 0
        ? `Keine Kurshistorie für ${paar} — ohne Monatsrenditen keine Saisonalität.`
        : null,
    }),
    baueSpur("qscore", {
      min: -qMax, max: qMax, mitte: 0,
      schwelleOben: QSCORE_SCHWELLE, schwelleUnten: -QSCORE_SCHWELLE,
      einheit: "Netto",
      linie: qLeer ? [] : qLinie,
      gegenLinie: null,
      linieTitel: "Netto der Faktoren",
      gegenTitel: null,
      bloecke: null,
      luecke: qLeer
        ? "Zins-, Inflations- und COT-Reihen liefern für diese Spanne nichts — "
          + "der Score wäre durchgehend null."
        : null,
    }),
  ];

  return {
    paar, von, bis, ersterTrade, letzterTrade,
    spuren, trades, saisonFenster, fehler: null,
  };
}
