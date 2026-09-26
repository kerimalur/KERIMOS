/**
 * Fundamentale Lage je Währung — nach Kerims drei Ebenen (26.09.2026).
 *
 * Warum überhaupt neu: Das ML-Ranking liefert einen Q-Score, dessen
 * Begründung in der Praxis fast nur aus der Zinslage besteht — die
 * Saisonalität steht bei allen acht Währungen auf 0.000. Ein Score, der
 * eine Zahl verdichtet, die man nirgends sieht, hilft beim Entscheiden
 * nicht. Deshalb wird hier nichts verdichtet, was nicht daneben steht:
 * jede Ebene zeigt ihre Teilwerte, jeder Teilwert seine Quelle.
 *
 * Die drei Ebenen (aus Kerims Notizen):
 *
 *   1 Wirtschaft   PMI, BIP, Arbeitslosenquote, Handelsbilanz.
 *                  Läuft die Wirtschaft?
 *   2 Zentralbank  Leitzins, Richtung, Markterwartung, Realzins, Zyklus.
 *                  Was macht die Notenbank daraus?
 *   3 Sentiment    Risiko-Regime, COT, laufende Ereignisse.
 *                  Wohin fliesst das Geld gerade?
 *
 * Alles hier ist reine Rechnung ohne Datenbank — prüfbar mit
 * `tools/checks/makro.mts`.
 */

export type Ebene = 1 | 2 | 3;

/** Ein einzelner Beitrag. `wert` ist die rohe Zahl, `score` der Beitrag −1…+1. */
export interface Teil {
  key: string;
  label: string;
  /** Rohwert, wie er auf der Seite steht. Null = keine Daten. */
  wert: number | null;
  einheit: string;
  /** Normierter Beitrag −1…+1. Null = zählt nicht mit. */
  score: number | null;
  /** Ein Satz, warum das so bewertet ist. */
  text: string;
  /** Veränderung zum Vorwert, wenn bekannt. */
  delta?: number | null;
}

export interface EbenenBild {
  ebene: Ebene;
  label: string;
  teile: Teil[];
  /** Mittel der Teile mit Daten. Null, wenn keiner Daten hat. */
  score: number | null;
  /** Wie viele Teile Daten hatten, von wie vielen möglichen. */
  belegt: number;
  moeglich: number;
}

export interface WaehrungsBild {
  ccy: string;
  ebenen: EbenenBild[];
  /** Gewichtetes Gesamturteil −1…+1. Null ohne jede Datenlage. */
  gesamt: number | null;
  /** Wie viel von der möglichen Datenlage vorhanden ist, 0…1. */
  abdeckung: number;
}

/** Gewichte der Ebenen im Gesamturteil. Sichtbar auf der Seite. */
export const GEWICHT: Record<Ebene, number> = { 1: 0.35, 2: 0.45, 3: 0.20 };

export const EBENEN_LABEL: Record<Ebene, string> = {
  1: "Wirtschaft",
  2: "Zentralbank",
  3: "Sentiment",
};

export type Zyklus = "straffung" | "pause_oben" | "lockerung" | "pause_unten";

export const ZYKLUS_LABEL: Record<Zyklus, string> = {
  straffung: "Straffung",
  pause_oben: "Pause oben",
  lockerung: "Lockerung",
  pause_unten: "Pause unten",
};

/** Was der Zyklus für die Währung bedeutet — Richtung, nicht Stärke. */
export const ZYKLUS_SCORE: Record<Zyklus, number> = {
  straffung: 1, pause_oben: 0.3, lockerung: -1, pause_unten: -0.3,
};

/** Von Hand gepflegte Zahlen je Währung. */
export interface HandWert {
  wert: number | null;
  vorwert: number | null;
  stand: string | null;
  quelle: string | null;
}

export interface Eingabe {
  ccy: string;
  /** Von Hand: pmi_industrie, pmi_dienste, bip_yoy, arbeitslos, handelsbilanz, rendite_10j, … */
  hand: Partial<Record<string, HandWert>>;
  zyklus: Zyklus | null;
  /** Aus der Trading-Datenbank gerechnet. */
  leitzins: number | null;
  leitzins6M: number | null;
  inflation: number | null;
  realzins: number | null;
  zweiJahr: number | null;
  /** 2-Jahres-Rendite minus Leitzins: was der Markt an Zinsschritten einpreist. */
  erwartung: number | null;
  /** COT-Perzentil der Leveraged Funds, 0…100. */
  cotRang: number | null;
  /** Wie stark die Währung am Risikoappetit hängt: −1 (Hafen) … +1 (Risiko). */
  risikoBeta: number;
  /** Ereignisse, die auf diese Währung zeigen: +1 profitiert, −1 leidet. */
  ereignisse: { titel: string; richtung: 1 | -1 }[];
}

export interface Umfeld {
  /** Durchschnittlicher Leitzins der acht Währungen. */
  zinsSchnitt: number | null;
  /** Durchschnittlicher Realzins. */
  realSchnitt: number | null;
  /** Risiko-Regime −1 (Risk-off) … +1 (Risk-on). Null = unbekannt. */
  regime: number | null;
}

const klemme = (v: number, max = 1) => Math.max(-max, Math.min(max, v));
const rund = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

const hv = (e: Eingabe, feld: string): HandWert =>
  e.hand[feld] ?? { wert: null, vorwert: null, stand: null, quelle: null };

const delta = (h: HandWert) =>
  h.wert !== null && h.vorwert !== null ? rund(h.wert - h.vorwert) : null;

/* ---------------------------------------------------------- Ebene 1 */

/**
 * Wirtschaft. Der PMI ist der Kern: über 50 wächst die Wirtschaft, darunter
 * schrumpft sie. Fünf Punkte Abstand von der 50 gelten hier als volle
 * Auslenkung — mehr kommt in der Praxis kaum vor.
 */
function ebeneWirtschaft(e: Eingabe): EbenenBild {
  const pmiTeil = (feld: string, label: string): Teil => {
    const h = hv(e, feld);
    const d = delta(h);
    return {
      key: feld, label, wert: h.wert, einheit: "Punkte", delta: d,
      score: h.wert === null ? null : klemme((h.wert - 50) / 5),
      text: h.wert === null ? "Kein Wert eingetragen."
        : `${h.wert.toFixed(1)} — ${h.wert >= 50 ? "Expansion" : "Kontraktion"}`
          + (d === null ? "." : `, ${d >= 0 ? "+" : ""}${d.toFixed(1)} zum Vormonat.`),
    };
  };

  const bip = hv(e, "bip_yoy");
  const arbeit = hv(e, "arbeitslos");
  const handel = hv(e, "handelsbilanz");
  const dArbeit = delta(arbeit);

  const teile: Teil[] = [
    pmiTeil("pmi_industrie", "PMI Industrie"),
    pmiTeil("pmi_dienste", "PMI Dienste"),
    {
      key: "bip_yoy", label: "BIP zum Vorjahr", wert: bip.wert, einheit: "%",
      delta: delta(bip),
      score: bip.wert === null ? null : klemme((bip.wert - 1.5) / 1.5),
      text: bip.wert === null ? "Kein Wert eingetragen."
        : `${bip.wert.toFixed(1)} % — ${bip.wert >= 1.5 ? "über" : "unter"} dem, was als solides Wachstum gilt.`,
    },
    {
      key: "arbeitslos", label: "Arbeitslosenquote", wert: arbeit.wert, einheit: "%",
      delta: dArbeit,
      // Nicht das Niveau zählt, sondern die Richtung: 7 % sind in Spanien
      // normal und in der Schweiz eine Krise. Steigt die Quote, senkt die
      // Zentralbank irgendwann — schlecht für die Währung.
      score: dArbeit === null ? null : klemme(-dArbeit / 0.3),
      text: arbeit.wert === null ? "Kein Wert eingetragen."
        : dArbeit === null ? `${arbeit.wert.toFixed(1)} % — ohne Vorwert kein Trend.`
          : `${arbeit.wert.toFixed(1)} %, ${dArbeit >= 0 ? "+" : ""}${dArbeit.toFixed(1)} pp — `
            + `${dArbeit > 0 ? "steigend, schlecht für die Währung" : dArbeit < 0 ? "fallend, gut für die Währung" : "unverändert"}.`,
    },
    {
      key: "handelsbilanz", label: "Handelsbilanz", wert: handel.wert, einheit: "% BIP",
      delta: delta(handel),
      score: handel.wert === null ? null : klemme(handel.wert / 4),
      text: handel.wert === null ? "Kein Wert eingetragen."
        : `${handel.wert >= 0 ? "+" : ""}${handel.wert.toFixed(1)} % des BIP — `
          + `${handel.wert >= 0 ? "Überschuss: Ausland kauft mehr, als das Land einkauft" : "Defizit: laufender Abfluss"}.`,
    },
  ];

  return fasse(1, teile);
}

/* ---------------------------------------------------------- Ebene 2 */

/**
 * Zentralbank. Nicht das Zinsniveau allein zählt, sondern der Abstand zu den
 * anderen sieben und die Richtung — Geld fliesst zur besseren Rendite, und
 * es fliesst, bevor der Schritt da ist.
 */
function ebeneZentralbank(e: Eingabe, u: Umfeld): EbenenBild {
  const rendite = hv(e, "rendite_10j");
  const nachfrage = hv(e, "anleihe_nachfrage");

  const teile: Teil[] = [
    {
      key: "zinsniveau", label: "Leitzins gegen die anderen",
      wert: e.leitzins, einheit: "%",
      score: e.leitzins === null || u.zinsSchnitt === null ? null
        : klemme((e.leitzins - u.zinsSchnitt) / 1.5),
      text: e.leitzins === null ? "Kein Leitzins in der Datenbank."
        : u.zinsSchnitt === null ? `${e.leitzins.toFixed(2)} %.`
          : `${e.leitzins.toFixed(2)} % gegen ${u.zinsSchnitt.toFixed(2)} % im Schnitt der acht.`,
    },
    {
      key: "richtung", label: "Zinsrichtung 6 Monate",
      wert: e.leitzins6M, einheit: "pp",
      score: e.leitzins6M === null ? null : klemme(e.leitzins6M / 0.5),
      text: e.leitzins6M === null ? "Keine Zinshistorie."
        : `${e.leitzins6M >= 0 ? "+" : ""}${e.leitzins6M.toFixed(2)} pp in sechs Monaten.`,
    },
    {
      key: "erwartung", label: "Markterwartung (2J − Leitzins)",
      wert: e.erwartung, einheit: "pp",
      score: e.erwartung === null ? null : klemme(e.erwartung / 0.5),
      text: e.erwartung === null ? "Keine 2-Jahres-Rendite für diese Währung."
        : `${e.erwartung >= 0 ? "+" : ""}${e.erwartung.toFixed(2)} pp — der Markt preist `
          + `${e.erwartung > 0.1 ? "Erhöhungen" : e.erwartung < -0.1 ? "Senkungen" : "keine Änderung"} ein.`,
    },
    {
      key: "realzins", label: "Realzins",
      wert: e.realzins, einheit: "%",
      score: e.realzins === null || u.realSchnitt === null ? null
        : klemme((e.realzins - u.realSchnitt) / 1.5),
      text: e.realzins === null ? "Leitzins oder Inflation fehlt."
        : `${e.realzins.toFixed(2)} % nach Inflation`
          + (e.inflation === null ? "." : ` (Inflation ${e.inflation.toFixed(1)} %).`),
    },
    {
      key: "zyklus", label: "Zyklus der Notenbank",
      wert: null, einheit: "",
      score: e.zyklus === null ? null : ZYKLUS_SCORE[e.zyklus],
      text: e.zyklus === null ? "Phase nicht eingetragen."
        : `${ZYKLUS_LABEL[e.zyklus]} — `
          + (e.zyklus === "straffung" ? "steigende Zinsen stützen die Währung."
            : e.zyklus === "lockerung" ? "fallende Zinsen belasten sie."
              : "Seitwärts, die Richtung entscheidet die nächste Sitzung."),
    },
    {
      key: "anleihen", label: "10-Jahres-Rendite",
      wert: rendite.wert, einheit: "%", delta: delta(rendite),
      // Steigende Langfristrenditen ziehen Kapital an, solange sie nicht aus
      // Zweifeln an der Bonität kommen. Deshalb nur halbes Gewicht über die
      // Veränderung, und die Nachfrage steht als eigene Zeile daneben.
      score: delta(rendite) === null ? null : klemme(delta(rendite)! / 0.5) * 0.5,
      text: rendite.wert === null ? "Kein Wert eingetragen."
        : `${rendite.wert.toFixed(2)} %`
          + (delta(rendite) === null ? "." : `, ${delta(rendite)! >= 0 ? "+" : ""}${delta(rendite)!.toFixed(2)} pp seit dem letzten Eintrag.`)
          + (nachfrage.wert === null ? "" : ` Nachfrage bei Auktionen (Bid-to-Cover): ${nachfrage.wert.toFixed(2)}.`),
    },
  ];

  return fasse(2, teile);
}

/* ---------------------------------------------------------- Ebene 3 */

/**
 * Sentiment. Das Regime allein sagt nichts über eine einzelne Währung — es
 * wirkt über ihr Risiko-Beta: AUD und NZD steigen im Risk-on, CHF und JPY
 * im Risk-off. Deshalb Regime × Beta statt Regime pur.
 */
function ebeneSentiment(e: Eingabe, u: Umfeld): EbenenBild {
  const ereignisScore = e.ereignisse.length === 0 ? null
    : klemme(e.ereignisse.reduce((s, x) => s + x.richtung, 0) / 2);

  const teile: Teil[] = [
    {
      key: "regime", label: "Risiko-Regime × Beta",
      wert: u.regime, einheit: "",
      score: u.regime === null ? null : klemme(u.regime * e.risikoBeta),
      text: u.regime === null ? "Kein Regime (VIX, S&P, Kupfer/Gold fehlen)."
        : `Regime ${u.regime >= 0.2 ? "Risk-on" : u.regime <= -0.2 ? "Risk-off" : "neutral"} `
          + `(${u.regime.toFixed(2)}), Beta dieser Währung ${e.risikoBeta.toFixed(1)}.`,
    },
    {
      key: "cot", label: "COT — Leveraged Funds",
      wert: e.cotRang, einheit: "Perzentil",
      // Die Fonds laufen mit dem Trend: ein hoher Rang heisst, sie sind long.
      // Als Bestätigung brauchbar, an den Rändern ein Warnsignal — deshalb
      // halbes Gewicht.
      score: e.cotRang === null ? null : klemme((e.cotRang - 50) / 50) * 0.5,
      text: e.cotRang === null ? "Keine COT-Reihe."
        : `Rang ${Math.round(e.cotRang)} von 100 in drei Jahren — `
          + `${e.cotRang >= 85 ? "sehr long, als Extrem lesen" : e.cotRang <= 15 ? "sehr short, als Extrem lesen" : "unauffällig"}.`,
    },
    {
      key: "ereignisse", label: "Laufende Ereignisse",
      wert: e.ereignisse.length || null, einheit: "",
      score: ereignisScore,
      text: e.ereignisse.length === 0 ? "Nichts eingetragen."
        : e.ereignisse.map((x) => `${x.richtung > 0 ? "+" : "−"} ${x.titel}`).join(" · "),
    },
  ];

  return fasse(3, teile);
}

function fasse(ebene: Ebene, teile: Teil[]): EbenenBild {
  const mitDaten = teile.filter((t) => t.score !== null);
  return {
    ebene, label: EBENEN_LABEL[ebene], teile,
    score: mitDaten.length === 0 ? null
      : rund(mitDaten.reduce((s, t) => s + (t.score ?? 0), 0) / mitDaten.length),
    belegt: mitDaten.length,
    moeglich: teile.length,
  };
}

/** Das Bild einer Währung über alle drei Ebenen. */
export function bewerteWaehrung(e: Eingabe, u: Umfeld): WaehrungsBild {
  const ebenen = [ebeneWirtschaft(e), ebeneZentralbank(e, u), ebeneSentiment(e, u)];

  // Gewichtet, aber nur über die Ebenen mit Daten — sonst zöge eine leere
  // Ebene das Urteil Richtung null und sähe aus wie „neutral".
  const mitDaten = ebenen.filter((x) => x.score !== null);
  const gewichtSumme = mitDaten.reduce((s, x) => s + GEWICHT[x.ebene], 0);
  const gesamt = gewichtSumme === 0 ? null
    : rund(mitDaten.reduce((s, x) => s + (x.score ?? 0) * GEWICHT[x.ebene], 0) / gewichtSumme);

  const belegt = ebenen.reduce((s, x) => s + x.belegt, 0);
  const moeglich = ebenen.reduce((s, x) => s + x.moeglich, 0);

  return { ccy: e.ccy, ebenen, gesamt, abdeckung: moeglich === 0 ? 0 : belegt / moeglich };
}

/* --------------------------------------------------------- Rangliste */

export interface RangZeile extends WaehrungsBild {
  rang: number;
}

/**
 * Stark gegen schwach — die eine Regel aus Kerims Notizen. Sortiert wird nach
 * dem Gesamturteil; Währungen ohne Datenlage stehen hinten statt in der Mitte.
 */
export function rangliste(bilder: WaehrungsBild[]): RangZeile[] {
  return [...bilder]
    .sort((a, b) => (b.gesamt ?? -99) - (a.gesamt ?? -99) || a.ccy.localeCompare(b.ccy))
    .map((b, i) => ({ ...b, rang: i + 1 }));
}

export interface PaarIdee {
  paar: string;
  seite: "Long" | "Short";
  abstand: number;
  stark: string;
  schwach: string;
}

/**
 * Paar-Ideen: die stärkste gegen die schwächste Währung, und so weiter nach
 * innen. Nur Paare mit spürbarem Abstand — bei zwei Währungen, die beide
 * mittelmässig dastehen, ist das Urteil keins.
 */
export function paarIdeen(
  zeilen: RangZeile[], handelbar: readonly string[], mindestAbstand = 0.4,
): PaarIdee[] {
  const mitUrteil = zeilen.filter((z) => z.gesamt !== null);
  const ideen: PaarIdee[] = [];

  for (const stark of mitUrteil) {
    for (const schwach of mitUrteil) {
      if (stark.ccy === schwach.ccy) continue;
      const abstand = rund((stark.gesamt ?? 0) - (schwach.gesamt ?? 0));
      if (abstand < mindestAbstand) continue;

      // Nur das Paar, das es als Instrument gibt — EURUSD ja, USDEUR nein.
      if (handelbar.includes(stark.ccy + schwach.ccy)) {
        ideen.push({ paar: stark.ccy + schwach.ccy, seite: "Long", abstand, stark: stark.ccy, schwach: schwach.ccy });
      } else if (handelbar.includes(schwach.ccy + stark.ccy)) {
        ideen.push({ paar: schwach.ccy + stark.ccy, seite: "Short", abstand, stark: stark.ccy, schwach: schwach.ccy });
      }
    }
  }

  return ideen.sort((a, b) => b.abstand - a.abstand).slice(0, 8);
}

/* ------------------------------------------------- Feld-Beschreibungen */

export interface FeldInfo {
  key: string;
  label: string;
  einheit: string;
  hinweis: string;
  /** Wo Kerim die Zahl herbekommt. */
  quelle: string;
}

/** Die von Hand gepflegten Felder — Reihenfolge wie im Formular. */
export const HAND_FELDER: FeldInfo[] = [
  { key: "pmi_industrie", label: "PMI Industrie", einheit: "Punkte",
    hinweis: "Über 50 wächst die Industrie, darunter schrumpft sie.",
    quelle: "Trading Economics · S&P Global / ISM / procure.ch" },
  { key: "pmi_dienste", label: "PMI Dienste", einheit: "Punkte",
    hinweis: "In den USA und UK die wichtigere der beiden Zahlen.",
    quelle: "Trading Economics · S&P Global / ISM" },
  { key: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%",
    hinweis: "Wächst die Wirtschaft überhaupt?",
    quelle: "Trading Economics · GDP Annual Growth Rate" },
  { key: "arbeitslos", label: "Arbeitslosenquote", einheit: "%",
    hinweis: "Die Richtung zählt: steigt sie, senkt die Notenbank irgendwann.",
    quelle: "Trading Economics · Unemployment Rate" },
  { key: "handelsbilanz", label: "Handelsbilanz", einheit: "% BIP",
    hinweis: "Überschuss heisst laufende Nachfrage nach der Währung.",
    quelle: "Trading Economics · Current Account to GDP" },
  { key: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%",
    hinweis: "Was der Staat langfristig zahlen muss.",
    quelle: "Trading Economics · Government Bond 10Y" },
  { key: "anleihe_nachfrage", label: "Nachfrage bei Auktionen", einheit: "Bid-to-Cover",
    hinweis: "Über 2 heisst: die Auktion war deutlich überzeichnet.",
    quelle: "Schuldenagentur des Landes · Auktionsergebnis" },
  { key: "staatsschulden", label: "Staatsschulden", einheit: "% BIP",
    hinweis: "Kontext, geht nicht ins Urteil ein.",
    quelle: "Trading Economics · Government Debt to GDP" },
];

/** Diese Felder stehen nur als Kontext da und zählen nicht ins Urteil. */
export const NUR_KONTEXT = ["staatsschulden"];

/** Woran die Währung ausserdem hängt — aus dem Lernzettel vom 22.09.2026. */
export const ROHSTOFF_BEZUG: Record<string, string> = {
  USD: "Weltreservewährung. Profitiert von Panik, ausser die Krise kommt aus den USA selbst.",
  EUR: "Energieimporteur. Steigende Gas- und Ölpreise belasten.",
  GBP: "Kaum Rohstoffbezug. Hängt an Zinsen und Politik.",
  JPY: "Importiert fast die ganze Energie. Sicherer Hafen, aber hoher Ölpreis belastet.",
  AUD: "Eisenerz, Kohle, Gas, Gold — und die Nachfrage aus China.",
  NZD: "Milchprodukte und Fleisch — und die Nachfrage aus China.",
  CAD: "Öl. Steigt der Ölpreis, steigt meist auch der CAD.",
  CHF: "Sicherer Hafen. Läuft oft mit Gold, profitiert von Krisen in Europa.",
};
