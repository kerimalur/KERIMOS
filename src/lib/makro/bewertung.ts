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
 * Die drei Ebenen (aus Kerims Notizen, geschärft am 26.09.2026 abends):
 *
 *   1 Wirtschaft   GEWERTET: PMI Industrie, PMI Dienste (über 50 positiv),
 *                  BIP zum Vorjahr. Frühindikator, Arbeitslosenquote und
 *                  Leistungsbilanz stehen nur als Kontext daneben.
 *   2 Zentralbank  GEWERTET: Zyklus (erhöht / gesenkt / gehalten), Richtung
 *                  über sechs Monate, Markterwartung. Zinsniveau, Realzins
 *                  und 10J-Rendite als Kontext.
 *   3 Sentiment    NICHT gewertet — nur angezeigt: Risiko-Regime, COT,
 *                  Ereignisse, Rohstoff-Abhängigkeit.
 *
 * Warum das Zinsniveau nicht mehr zählt: es hat CHF (Leitzins 0 %) allein
 * deshalb zur schwächsten Währung gemacht und AUDCHF als einzige Idee
 * übrig gelassen. Kerims Frage an die Notenbank ist nicht „wie hoch", sondern
 * „was hat sie getan und was hat sie vor".
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
  /** Nur bei gepflegten/geholten Feldern: welches Feld, von wann, woher. */
  feld?: string;
  stand?: string | null;
  quelle?: string | null;
  /** ok = frisch · veraltet = zu alt, zählt nicht mit · fehlt = kein Wert. */
  status?: "ok" | "veraltet" | "fehlt";
  /** Nur Kontext: wird angezeigt, geht aber nicht in den Score der Ebene. */
  kontext?: boolean;
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

/**
 * Gewichte der Ebenen im Gesamturteil. Seit 03.10.2026 nur die Wirtschaft —
 * gleich wie das Urteil in urteil.ts (Varianten-Test im Makro-Backtest).
 * Die Zentralbank-Ebene wird weiter gerechnet und angezeigt.
 */
export const GEWICHT: Record<Ebene, number> = { 1: 1, 2: 0, 3: 0 };

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
  /** Länge der Periode in Monaten (1 monatlich, 3 Quartal, 12 Jahr). */
  periode?: number;
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
  /** Zinsschritte der Notenbank aus dem Leitzinsverlauf, aufsteigend. */
  zinsSchritte?: ZinsSchritt[];
}

export interface ZinsSchritt {
  datum: string;
  /** Änderung in Basispunkten, + = Erhöhung. */
  bps: number;
  /** Leitzins nach dem Schritt. */
  neu: number;
}

/** Zinsschritte aus einer Leitzinsreihe: jede Änderung ab 5 Basispunkten. */
export function zinsSchritteAus(punkte: { datum: string; wert: number }[]): ZinsSchritt[] {
  const out: ZinsSchritt[] = [];
  for (let i = 1; i < punkte.length; i++) {
    const d = punkte[i].wert - punkte[i - 1].wert;
    if (Math.abs(d) >= 0.05) out.push({ datum: punkte[i].datum, bps: Math.round(d * 100), neu: punkte[i].wert });
  }
  return out;
}

/**
 * Der Zyklus aus den Zinsschritten, wenn er nicht von Hand gesetzt ist.
 *
 * Letzter Schritt innerhalb von sechs Monaten: Straffung bzw. Lockerung
 * läuft. Länger her: Pause — oben, wenn zuletzt erhöht wurde, unten, wenn
 * zuletzt gesenkt wurde. Kein Schritt in der Historie: unbekannt.
 */
export function zyklusAus(schritte: ZinsSchritt[], heute = new Date()): Zyklus | null {
  const letzter = schritte[schritte.length - 1];
  if (!letzter) return null;
  const tage = (heute.getTime() - Date.parse(`${letzter.datum}T12:00:00Z`)) / 86_400_000;
  if (tage <= 182) return letzter.bps > 0 ? "straffung" : "lockerung";
  return letzter.bps > 0 ? "pause_oben" : "pause_unten";
}

export interface Umfeld {
  /** Durchschnittlicher Leitzins der acht Währungen. */
  zinsSchnitt: number | null;
  /** Durchschnittlicher Realzins. */
  realSchnitt: number | null;
  /** Risiko-Regime −1 (Risk-off) … +1 (Risk-on). Null = unbekannt. */
  regime: number | null;
}

const rund = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

/**
 * Auf −1…+1 begrenzen und auf zwei Stellen runden.
 *
 * Gerundet wird hier und nicht erst in der Anzeige: sonst steht in der
 * Tabelle −0.67 und in der Rechnung −0.6666…, und zwei Zahlen, die dasselbe
 * sein sollen, weichen voneinander ab.
 */
const klemme = (v: number, max = 1) => rund(Math.max(-max, Math.min(max, v)));

const hv = (e: Eingabe, feld: string): HandWert =>
  e.hand[feld] ?? { wert: null, vorwert: null, stand: null, quelle: null, periode: 1 };

const delta = (h: HandWert) =>
  h.wert !== null && h.vorwert !== null ? rund(h.wert - h.vorwert) : null;

/* ---------------------------------------------------------- Ebene 1 */

/**
 * Wirtschaft. Der PMI ist der Kern: über 50 wächst die Wirtschaft, darunter
 * schrumpft sie. Fünf Punkte Abstand von der 50 gelten hier als volle
 * Auslenkung — mehr kommt in der Praxis kaum vor.
 */
function ebeneWirtschaft(e: Eingabe, heute = new Date()): EbenenBild {
  const pmiTeil = (feld: string, label: string): Teil => {
    const h = hv(e, feld);
    const d = delta(h);
    return {
      key: feld, label, wert: h.wert, einheit: "Punkte", delta: d,
      score: h.wert === null ? null : klemme((h.wert - 50) / 5),
      text: h.wert === null ? "Kein Wert im Kalender — von Hand nachtragen."
        : `${h.wert.toFixed(1)} — ${h.wert >= 50 ? "Expansion" : "Kontraktion"}`
          + (d === null ? "." : `, ${d >= 0 ? "+" : ""}${d.toFixed(1)} zum Vormonat.`),
    };
  };

  const bip = hv(e, "bip_yoy");
  const arbeit = hv(e, "arbeitslos");
  const handel = hv(e, "handelsbilanz");
  const dArbeit = delta(arbeit);

  const cli = hv(e, "fruehindikator");
  const dCli = delta(cli);

  const teile: Teil[] = [
    {
      // Ersatz für den PMI: den gibt es nirgends kostenlos als Schnittstelle.
      // Der OECD-Frühindikator misst dasselbe — dreht die Konjunktur an oder
      // ab — und schwankt um 100. Niveau und Richtung zählen je zur Hälfte:
      // 99.4 und steigend ist etwas anderes als 99.4 und fallend.
      key: "fruehindikator", label: "Frühindikator", wert: cli.wert,
      einheit: "Index", delta: dCli, kontext: true,
      score: cli.wert === null ? null
        : klemme(0.5 * klemme(cli.wert - 100) + 0.5 * klemme((dCli ?? 0) / 0.2)),
      text: cli.wert === null ? "Kommt automatisch von FRED, sobald der Lauf durch ist."
        : `${cli.wert.toFixed(1)} — ${cli.wert >= 100 ? "über" : "unter"} dem Trend`
          + (dCli === null ? "." : `, ${dCli >= 0 ? "steigend" : "fallend"} (${dCli >= 0 ? "+" : ""}${dCli.toFixed(2)}).`),
    },
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
      delta: dArbeit, kontext: true,
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
      key: "handelsbilanz", label: "Leistungsbilanz", wert: handel.wert, einheit: "% BIP",
      delta: delta(handel), kontext: true,
      score: handel.wert === null ? null : klemme(handel.wert / 4),
      text: handel.wert === null ? "Kein Wert eingetragen."
        : `${handel.wert >= 0 ? "+" : ""}${handel.wert.toFixed(1)} % des BIP — `
          + `${handel.wert >= 0 ? "Überschuss: Ausland kauft mehr, als das Land einkauft" : "Defizit: laufender Abfluss"}.`,
    },
  ];

  return fasse(1, teile.map((t) => markiere(t, t.key, hv(e, t.key), heute)));
}

/**
 * Wie alt eine Zahl höchstens sein darf — in Monaten NACH dem Ende ihrer
 * Periode. Ein BIP für Q2 (Apr–Jun) ist Ende Juni „frisch" und wird Ende
 * November veraltet, wenn Q3 längst da sein müsste.
 *
 * Die Grenzen folgen dem Veröffentlichungsrhythmus: monatliche Zahlen
 * kommen etwa einen Monat nach Periodenende, Quartals-BIP nach zwei, die
 * Jahreswerte des IMF erst im Frühling des Folgejahres.
 */
export const MAX_ALTER: Record<string, number> = {
  fruehindikator: 3,
  pmi_industrie: 2,
  pmi_dienste: 2,
  arbeitslos: 3,
  bip_yoy: 5,
  rendite_10j: 2,
  handelsbilanz: 12,
  staatsschulden: 12,
  anleihe_nachfrage: 3,
};

/** Monate zwischen dem Ende der Periode und heute. */
export function alterMonate(stand: string, periode = 1, heute = new Date()): number | null {
  const d = new Date(`${stand.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const monate = (heute.getUTCFullYear() - d.getUTCFullYear()) * 12
    + (heute.getUTCMonth() - d.getUTCMonth());
  return monate - Math.max(1, periode) + 1;
}

export function istVeraltet(feld: string, h: HandWert, heute = new Date()): boolean {
  if (h.wert === null || !h.stand) return false;
  const alter = alterMonate(h.stand, h.periode ?? 1, heute);
  return alter !== null && alter > (MAX_ALTER[feld] ?? 3);
}

/**
 * Hängt Stand, Quelle und Zustand an einen Teilwert.
 *
 * Veraltet heisst: der Wert bleibt sichtbar, aber er zählt nicht mit — eine
 * Konjunkturzahl von vor einem Jahr soll nicht über die Richtung heute
 * entscheiden. Die Seite markiert ihn und verlinkt, wo man den aktuellen
 * holt (lib/makro/links.ts).
 */
export function markiere(t: Teil, feld: string, h: HandWert, heute = new Date()): Teil {
  const basis = { ...t, feld, stand: h.stand, quelle: h.quelle };
  if (h.wert === null) return { ...basis, status: "fehlt" };
  if (!istVeraltet(feld, h, heute)) return { ...basis, status: "ok" };
  const wann = new Date(`${h.stand!.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString("de-CH", { month: "2-digit", year: "numeric", timeZone: "UTC" });
  return {
    ...basis,
    status: "veraltet",
    score: null,
    text: `Veraltet — letzter Wert von ${wann}. Zählt nicht mit, bis ein aktueller da ist.`,
  };
}

/* ---------------------------------------------------------- Ebene 2 */

/**
 * Zentralbank. Nicht das Zinsniveau allein zählt, sondern der Abstand zu den
 * anderen sieben und die Richtung — Geld fliesst zur besseren Rendite, und
 * es fliesst, bevor der Schritt da ist.
 */
function ebeneZentralbank(e: Eingabe, u: Umfeld, heute = new Date()): EbenenBild {
  const rendite = hv(e, "rendite_10j");
  const nachfrage = hv(e, "anleihe_nachfrage");

  const teile: Teil[] = [
    {
      key: "zinsniveau", label: "Leitzins gegen die anderen",
      wert: e.leitzins, einheit: "%", kontext: true,
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
      wert: e.realzins, einheit: "%", kontext: true,
      score: e.realzins === null || u.realSchnitt === null ? null
        : klemme((e.realzins - u.realSchnitt) / 1.5),
      text: e.realzins === null ? "Leitzins oder Inflation fehlt."
        : `${e.realzins.toFixed(2)} % nach Inflation`
          + (e.inflation === null ? "." : ` (Inflation ${e.inflation.toFixed(1)} %).`),
    },
    (() => {
      // Von Hand gesetzt gewinnt; sonst aus den Zinsschritten abgeleitet.
      const auto = e.zyklus === null ? zyklusAus(e.zinsSchritte ?? [], heute) : null;
      const z = e.zyklus ?? auto;
      const letzter = (e.zinsSchritte ?? []).at(-1);
      const schritt = letzter
        ? ` Letzter Schritt ${letzter.bps > 0 ? "+" : ""}${letzter.bps} bp am `
          + `${new Date(`${letzter.datum}T12:00:00Z`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}.`
        : "";
      return {
        key: "zyklus", label: "Zyklus der Notenbank",
        wert: null, einheit: "",
        score: z === null ? null : ZYKLUS_SCORE[z],
        text: z === null ? "Kein Zinsschritt in der Historie und nichts eingetragen."
          : `${ZYKLUS_LABEL[z]}${auto ? " (aus dem Zinsverlauf)" : ""} — `
            + (z === "straffung" ? "steigende Zinsen stützen die Währung."
              : z === "lockerung" ? "fallende Zinsen belasten sie."
                : z === "pause_oben" ? "Zinsen oben gehalten — stützt, solange die Pause hält."
                  : "Zinsen unten gehalten — belastet, solange nichts steigt.")
            + schritt,
      } as Teil;
    })(),
    {
      key: "anleihen", label: "10-Jahres-Rendite",
      wert: rendite.wert, einheit: "%", delta: delta(rendite), kontext: true,
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

  return fasse(2, teile.map((t) =>
    t.key === "anleihen" ? markiere(t, "rendite_10j", rendite, heute) : t));
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
      // Beta 0 (EUR) heisst: das Regime sagt über diese Währung nichts. Dann
      // ist „keine Aussage" richtig und 0 wäre falsch — eine 0 würde als
      // neutrales Urteil mitgemittelt und das Gesamtbild verwässern.
      score: u.regime === null || e.risikoBeta === 0 ? null
        : klemme(u.regime * e.risikoBeta),
      text: u.regime === null ? "Kein Regime (VIX, S&P, Kupfer/Gold fehlen)."
        : e.risikoBeta === 0 ? "Diese Währung hängt kaum am Risikoappetit — kein Beitrag."
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

  // Ebene 3 wird angezeigt, aber (noch) nicht gewertet — Kerim, 26.09.2026.
  return fasse(3, teile.map((t) => ({ ...t, kontext: true })));
}

function fasse(ebene: Ebene, teile: Teil[]): EbenenBild {
  // Kontext-Teile stehen da, zählen aber weder in den Score noch in „belegt".
  const gewertet = teile.filter((t) => !t.kontext);
  const mitDaten = gewertet.filter((t) => t.score !== null);
  return {
    ebene, label: EBENEN_LABEL[ebene], teile,
    score: mitDaten.length === 0 ? null
      : rund(mitDaten.reduce((s, t) => s + (t.score ?? 0), 0) / mitDaten.length),
    belegt: mitDaten.length,
    moeglich: gewertet.length,
  };
}

/**
 * Das Bild einer Währung über alle drei Ebenen.
 *
 * `heute`: der Stichtag. Live ist es jetzt; die Rückrechnung
 * (lib/makro/rueckrechnung.ts) setzt einen Montag in der Vergangenheit —
 * davon hängen „veraltet" und der Zyklus aus den Zinsschritten ab.
 */
export function bewerteWaehrung(e: Eingabe, u: Umfeld, heute = new Date()): WaehrungsBild {
  const ebenen = [ebeneWirtschaft(e, heute), ebeneZentralbank(e, u, heute), ebeneSentiment(e, u)];

  // Gewichtet, aber nur über die Ebenen mit Daten — sonst zöge eine leere
  // Ebene das Urteil Richtung null und sähe aus wie „neutral".
  const mitDaten = ebenen.filter((x) => x.score !== null && GEWICHT[x.ebene] > 0);
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
/**
 * Ab diesem Abstand im Gesamtscore gilt „stark gegen schwach".
 *
 * 0.40 auf einer Skala von −1 bis +1: darunter stehen beide Währungen
 * irgendwo in der Mitte, und ein Paar aus zwei mittelmässigen Urteilen ist
 * kein Urteil. Dieselbe Zahl gilt für die Paar-Ideen und für die Gegenprobe
 * am einzelnen Trade — sonst könnte die Seite ein Paar vorschlagen, das der
 * Trade-Dialog danach „neutral" nennt.
 */
export const MIND_ABSTAND = 0.4;

export function paarIdeen(
  zeilen: RangZeile[], handelbar: readonly string[], mindestAbstand = MIND_ABSTAND,
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

/* ------------------------------------------------- Urteil zu EINEM Paar */

export type PaarSeite = "long" | "short";

export interface PaarUrteil {
  paar: string;
  basis: string;
  quote: string;
  basisScore: number | null;
  quoteScore: number | null;
  basisRang: number | null;
  quoteRang: number | null;
  /** Basis minus Quote. Positiv heisst: die drei Ebenen sprechen für Long. */
  abstand: number | null;
  /** Was die Ebenen für sich genommen nahelegen. */
  ebenenSeite: PaarSeite | "neutral" | "unbekannt";
  /** Wie sich das zur geplanten Seite verhält. */
  urteil: "bestaetigt" | "dagegen" | "neutral" | "unbekannt";
  /** Die Kurzfassung für eine Zeile: „EUR +0.42 · USD −0.18". */
  grund: string;
  satz: string;
}

const vz = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

/**
 * Sprechen die drei Ebenen für diesen Trade?
 *
 * Ersetzt seit dem 26.09.2026 `checkFundamental` aus dem Q-Score. Die alte
 * Antwort war „EUR Q5 · USD Q1" — eine Quintilnummer aus einem ML-Modell, das
 * in der Praxis fast nur die Zinslage abgebildet hat, und deren Zustandekommen
 * man nirgends nachlesen konnte. Hier steht stattdessen dieselbe Zahl, die auf
 * der Fundamentals-Seite in der Rangliste steht, und der Weg dorthin ist die
 * Ebenen-Aufschlüsselung derselben Seite.
 *
 * `seite = null` heisst: nur die Lage beschreiben, keine Richtung prüfen.
 */
export function paarUrteil(
  zeilen: RangZeile[], paar: string, seite: PaarSeite | null,
  mindestAbstand = MIND_ABSTAND,
): PaarUrteil {
  const sauber = paar.replace(/[^A-Za-z]/g, "").toUpperCase();
  const basis = sauber.slice(0, 3);
  const quote = sauber.slice(3, 6);
  const b = zeilen.find((z) => z.ccy === basis) ?? null;
  const q = zeilen.find((z) => z.ccy === quote) ?? null;
  const bs = b?.gesamt ?? null;
  const qs = q?.gesamt ?? null;

  const rumpf = {
    paar: sauber, basis, quote,
    basisScore: bs, quoteScore: qs,
    basisRang: b?.rang ?? null, quoteRang: q?.rang ?? null,
  };

  if (bs === null || qs === null) {
    const fehlt = [bs === null ? basis : null, qs === null ? quote : null]
      .filter(Boolean).join(" und ");
    return {
      ...rumpf, abstand: null, ebenenSeite: "unbekannt", urteil: "unbekannt",
      grund: `${basis} — · ${quote} —`,
      satz: `Zu ${fehlt} liegt kein Urteil vor — ohne Daten auf mindestens einer `
        + "Seite lässt sich das Paar nicht bewerten.",
    };
  }

  const abstand = rund(bs - qs);
  const ebenenSeite: PaarUrteil["ebenenSeite"] =
    abstand >= mindestAbstand ? "long"
      : abstand <= -mindestAbstand ? "short"
        : "neutral";

  const urteil: PaarUrteil["urteil"] =
    ebenenSeite === "neutral" || !seite ? "neutral"
      : ebenenSeite === seite ? "bestaetigt" : "dagegen";

  const grund = `${basis} ${vz(bs)} · ${quote} ${vz(qs)}`;
  const stark = abstand > 0 ? basis : quote;
  const schwach = abstand > 0 ? quote : basis;

  const satz = ebenenSeite === "neutral"
    ? `Abstand ${vz(abstand)} — beide Währungen stehen zu nah beieinander. `
      + `Erst ab ${mindestAbstand.toFixed(2)} ist das eine Aussage.`
    : `${stark} steht fundamental über ${schwach} (Abstand ${vz(Math.abs(abstand))}). `
      + (urteil === "bestaetigt" ? "Das spricht für diese Richtung."
        : urteil === "dagegen" ? "Das spricht gegen diese Richtung."
          : `Die Ebenen legen ${ebenenSeite === "long" ? "Long" : "Short"} nahe.`);

  return { ...rumpf, abstand, ebenenSeite, urteil, grund, satz };
}

/* ------------------------------------------------- Feld-Beschreibungen */

export interface FeldInfo {
  key: string;
  label: string;
  einheit: string;
  hinweis: string;
  /** Wo die Zahl herkommt. */
  quelle: string;
  /**
   * Kommt automatisch von FRED (/api/makro-sync). Eine Eingabe von Hand
   * überschreibt sie trotzdem — für den Fall, dass die Reihe hinterherhinkt.
   */
  auto?: boolean;
}

/** Die von Hand gepflegten Felder — Reihenfolge wie im Formular. */
export const HAND_FELDER: FeldInfo[] = [
  { key: "fruehindikator", label: "Frühindikator", einheit: "Index", auto: true,
    hinweis: "Ersatz für den PMI. Schwankt um 100, über 100 zieht die Konjunktur an.",
    quelle: "OECD (CLI), für CHF/NZD nicht mehr veröffentlicht" },
  { key: "pmi_industrie", label: "PMI Industrie", einheit: "Punkte",
    hinweis: "Über 50 wächst die Industrie, darunter schrumpft sie.",
    quelle: "Forex Factory (S&P Global / HCOB / ISM / procure.ch), monatlich" },
  { key: "pmi_dienste", label: "PMI Dienste", einheit: "Punkte",
    hinweis: "In den USA und UK die wichtigere der beiden Zahlen.",
    quelle: "Forex Factory (S&P Global / HCOB / ISM), monatlich" },
  { key: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", auto: true,
    hinweis: "Wächst die Wirtschaft überhaupt?",
    quelle: "OECD / Eurostat / BEA, quartalsweise" },
  { key: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", auto: true,
    hinweis: "Die Richtung zählt: steigt sie, senkt die Notenbank irgendwann.",
    quelle: "OECD / Eurostat / FRED, monatlich" },
  { key: "handelsbilanz", label: "Handelsbilanz", einheit: "% BIP",
    hinweis: "Leistungsbilanz (Handel + Einkommen). Überschuss heisst laufende Nachfrage nach der Währung.",
    quelle: "IMF · Leistungsbilanz in % des BIP, jährlich" },
  { key: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", auto: true,
    hinweis: "Was der Staat langfristig zahlen muss.",
    quelle: "FRED / Eurostat, US täglich" },
  { key: "anleihe_nachfrage", label: "Nachfrage bei Auktionen", einheit: "Bid-to-Cover",
    hinweis: "Über 2 heisst: die Auktion war deutlich überzeichnet.",
    quelle: "Schuldenagentur des Landes · Auktionsergebnis" },
  { key: "staatsschulden", label: "Staatsschulden", einheit: "% BIP",
    hinweis: "Kontext, geht nicht ins Urteil ein.",
    quelle: "IMF · Bruttoschulden in % des BIP, jährlich" },
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
