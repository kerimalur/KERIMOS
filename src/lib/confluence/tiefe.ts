import { wilson, lagerVon, MIN_JE_SEITE, type Quote, type TradeUrteil, type Lager } from "./bilanz";
import { FAKTOR_LABEL, type FaktorKey } from "./faktoren";

/**
 * Die tiefere Auswertung: nicht nur OB der Filter trägt, sondern WO und DURCH WEN.
 *
 * `bilanz.ts` beantwortet eine Frage — lief es mit Rückenwind besser als
 * dagegen. Das ist die richtige erste Frage, aber sie sagt nicht, welcher der
 * fünf Faktoren die Arbeit macht und ob sich der Unterschied in der Trefferzahl
 * oder in der Art des Ausgangs zeigt. Genau dort liegt der Unterschied zwischen
 * „der Filter wirkt" und „ich weiss, was ich damit anfange".
 *
 * Dieselbe Disziplin wie nebenan: Wilson-Intervalle, `MIN_JE_SEITE`, und
 * „kein Nachweis" als völlig normales Ergebnis. Je feiner man schneidet, desto
 * kleiner die Zellen — eine Aufschlüsselung nach fünf Faktoren über 150 Trades
 * produziert mühelos zehn Zahlen, von denen keine einzige belastbar ist. Das
 * muss dranstehen, sonst liest man Rauschen als Erkenntnis.
 *
 * Rein rechnerisch, keine Datenbank. Prüfbar in `tools/checks/confluence.mts`.
 */

export interface TiefenTrade extends TradeUrteil {
  /** Ausgang in der Sprache des Backtest-Journals: "full_tp", "sl", … */
  ergebnis: string;
  /** Richtung jedes einzelnen Faktors, bezogen auf das Paar (nicht den Trade). */
  faktoren: { key: FaktorKey; dir: -1 | 0 | 1 }[];
  /** TradingView-Link, damit die Screenshot-Runde daran andocken kann. */
  link: string | null;
}

/* ------------------------------------------------- Lager × Ergebnis */

export interface KreuzZeile {
  lager: Lager;
  n: number;
  /** Anzahl je Ergebnis-Schlüssel, in der Reihenfolge der übergebenen Liste. */
  proErgebnis: number[];
  gesamtR: number;
  erwartung: number | null;
  quote: Quote;
}

/**
 * Wie die Trades je Lager ausgegangen sind — Full TP, Teil-TP, SL.
 *
 * Der Punkt dieser Tabelle: eine Winrate kann gleich bleiben, während sich
 * die ART der Gewinne verschiebt. Wenn mit Rückenwind genauso oft gewonnen
 * wird, aber öfter voll durchläuft statt am Break-even zu enden, sieht man das
 * NUR hier — in der Winrate nicht, im Ø R nur verwaschen.
 */
export function ergebnisKreuz(trades: TiefenTrade[], ergebnisse: string[]): KreuzZeile[] {
  const lager: Lager[] = ["rueckenwind", "uneinig", "gegenwind", "ohne"];

  return lager.map((l) => {
    const eigene = trades.filter((t) => lagerVon(t.urteil) === l);
    const gewertet = eigene.filter((t) => t.gewonnen !== null);
    const summeR = eigene.reduce((s, t) => s + t.r, 0);

    return {
      lager: l,
      n: eigene.length,
      proErgebnis: ergebnisse.map((e) => eigene.filter((t) => t.ergebnis === e).length),
      gesamtR: Math.round(summeR * 100) / 100,
      erwartung: eigene.length > 0 ? summeR / eigene.length : null,
      // Break-even zählt zur Gruppengrösse, aber nicht in die Trefferquote —
      // dieselbe Konvention wie in bilanz.gruppiere.
      quote: wilson(gewertet.filter((t) => t.gewonnen === true).length, gewertet.length),
    };
  });
}

/* ------------------------------------------------------- Faktor für Faktor */

export type FaktorBefund = "traegt" | "verkehrt" | "kein-nachweis" | "zu-wenig";

export interface FaktorZeile {
  key: FaktorKey;
  label: string;
  /** Trades, bei denen dieser Faktor in die gehandelte Richtung zeigte. */
  dafuer: Quote;
  /** Trades, bei denen er dagegen zeigte. */
  dagegen: Quote;
  /** Trades, bei denen er nichts sagte oder keine Daten hatte. */
  stumm: number;
  erwartungDafuer: number | null;
  erwartungDagegen: number | null;
  /** Differenz der Trefferquoten in Prozentpunkten. */
  abstand: number | null;
  befund: FaktorBefund;
  satz: string;
}

/**
 * Welcher Faktor trägt das Ergebnis — und welcher hängt nur mit dran?
 *
 * Gemessen wird je Faktor getrennt: Trades, bei denen er in die gehandelte
 * Richtung zeigte, gegen Trades, bei denen er dagegen zeigte. Trades, bei
 * denen er nichts sagte, fallen aus BEIDEN Seiten heraus, statt stillschweigend
 * bei „dagegen" zu landen — sonst hätte ein Faktor ohne Datenquelle
 * automatisch eine schlechte Bilanz.
 *
 * Eine Warnung, die zum Ergebnis gehört: die fünf Zeilen sind NICHT unabhängig
 * voneinander. Zinsdifferenz und Realzins teilen sich den Leitzins, und wer bei
 * fünf Faktoren nach dem besten sucht, findet auch in Zufallszahlen einen. Die
 * Tabelle ist zum Verstehen da, nicht zum Aussuchen.
 */
export function faktorBilanz(trades: TiefenTrade[], keys: FaktorKey[]): FaktorZeile[] {
  return keys.map((key) => {
    const mit: TiefenTrade[] = [];
    const gegen: TiefenTrade[] = [];
    let stumm = 0;

    for (const t of trades) {
      const f = t.faktoren.find((x) => x.key === key);
      // Bezogen auf den TRADE, nicht auf das Paar: bei einem Short spricht ein
      // Faktor mit dir = −1 für den Trade.
      const wirkung = f ? f.dir * t.richtung : 0;
      if (wirkung > 0) mit.push(t);
      else if (wirkung < 0) gegen.push(t);
      else stumm++;
    }

    const quoteVon = (liste: TiefenTrade[]) => {
      const gewertet = liste.filter((t) => t.gewonnen !== null);
      return wilson(gewertet.filter((t) => t.gewonnen === true).length, gewertet.length);
    };
    const erwartungVon = (liste: TiefenTrade[]) =>
      liste.length > 0 ? liste.reduce((s, t) => s + t.r, 0) / liste.length : null;

    const qMit = quoteVon(mit);
    const qGegen = quoteVon(gegen);
    const abstand = qMit.quote !== null && qGegen.quote !== null
      ? (qMit.quote - qGegen.quote) * 100 : null;

    const label = FAKTOR_LABEL[key];
    let befund: FaktorBefund;
    let satz: string;

    if (qMit.n < MIN_JE_SEITE || qGegen.n < MIN_JE_SEITE) {
      befund = "zu-wenig";
      satz = `${qMit.n} dafür, ${qGegen.n} dagegen`
        + (stumm > 0 ? `, ${stumm} ohne Aussage` : "")
        + `. Unter ${MIN_JE_SEITE} je Seite sagt der Vergleich nichts.`;
    } else {
      // Nicht-überlappende Intervalle — derselbe strenge Test wie in
      // bilanz.vergleiche. Lieber einen echten Effekt übersehen als einen
      // erfundenen behaupten.
      const getrennt = qMit.unten! > qGegen.oben! || qGegen.unten! > qMit.oben!;
      const besser = (qMit.quote ?? 0) > (qGegen.quote ?? 0);
      const zahlen = `${(qMit.quote! * 100).toFixed(1)} % gegen ${(qGegen.quote! * 100).toFixed(1)} %`;

      if (!getrennt) {
        befund = "kein-nachweis";
        satz = `${zahlen} — die Intervalle überlappen. Kein Nachweis, `
          + `auch wenn ${abstand! > 0 ? "+" : ""}${abstand!.toFixed(1)} Punkte viel aussehen.`;
      } else if (besser) {
        befund = "traegt";
        satz = `${zahlen}, Intervalle getrennt. ${label} trägt in dieser Stichprobe.`;
      } else {
        befund = "verkehrt";
        satz = `${zahlen} — gegen den Faktor lief es besser, und zwar deutlich. `
          + `Entweder ist ${label} für dieses Paar falsch herum, oder er misst etwas anderes.`;
      }
    }

    return {
      key, label, dafuer: qMit, dagegen: qGegen, stumm,
      erwartungDafuer: erwartungVon(mit),
      erwartungDagegen: erwartungVon(gegen),
      abstand, befund, satz,
    };
  });
}

/* ------------------------------------------------------------- Zeitachse */

export const LAGER_ORDNUNG: Lager[] = ["rueckenwind", "uneinig", "gegenwind", "ohne"];

export interface JahresZeile {
  jahr: string;
  n: number;
  /** Anzahl je Lager, in der Reihenfolge von LAGER_ORDNUNG. */
  proLager: number[];
  quote: Quote;
  erwartung: number | null;
}

/** Wie sich Trades und Lager ueber die Jahre verteilen. */
export function jahresVerteilung(trades: TiefenTrade[]): JahresZeile[] {
  const jahre = [...new Set(trades.map((t) => t.datum.slice(0, 4)))].sort();

  return jahre.map((jahr) => {
    const eigene = trades.filter((t) => t.datum.startsWith(jahr));
    const gewertet = eigene.filter((t) => t.gewonnen !== null);
    return {
      jahr,
      n: eigene.length,
      proLager: LAGER_ORDNUNG.map(
        (l) => eigene.filter((t) => lagerVon(t.urteil) === l).length),
      quote: wilson(gewertet.filter((t) => t.gewonnen === true).length, gewertet.length),
      erwartung: eigene.length > 0
        ? eigene.reduce((s, t) => s + t.r, 0) / eigene.length : null,
    };
  });
}

export interface ZeitBefund {
  /** Anteil "kein Urteil" in der ersten Haelfte des Zeitraums, 0…1. */
  anteilFrueh: number | null;
  anteilSpaet: number | null;
  trennDatum: string | null;
  verdaechtig: boolean;
  satz: string;
}

/** Ab wie vielen Prozentpunkten Unterschied die Aufteilung verdaechtig ist. */
export const ZEIT_GRENZE = 0.25;

/**
 * Ist die Lager-Aufteilung in Wahrheit eine Zeitachse?
 *
 * Die Gruppe "kein Urteil moeglich" entsteht, wenn dem Modell die Daten
 * fehlen — und Daten fehlen vor allem FRUEH: die Kursreihen fuer das
 * Risiko-Regime reichen nicht so weit zurueck wie die aeltesten Trades.
 * Haeufen sich die urteilslosen Trades in der ersten Haelfte, dann trennt die
 * Tabelle oben nicht nach Fundamentallage, sondern nach Jahr. Und wenn sich
 * die eigene Erfassung ueber die Jahre veraendert hat, erklaert das den
 * Unterschied zwischen den Lagern vollstaendig, ohne dass ein einziger
 * Zinssatz daran beteiligt waere.
 *
 * Bewusst nur ein Verdacht und kein Urteil: der Test sagt, dass zwei
 * Erklaerungen im Spiel sind, nicht welche stimmt.
 */
export function zeitBefund(trades: TiefenTrade[]): ZeitBefund {
  const sortiert = [...trades].sort((a, b) => a.datum.localeCompare(b.datum));
  if (sortiert.length < 8) {
    return {
      anteilFrueh: null, anteilSpaet: null, trennDatum: null, verdaechtig: false,
      satz: "Zu wenige Trades fuer einen Zeitvergleich.",
    };
  }

  const mitte = Math.floor(sortiert.length / 2);
  const frueh = sortiert.slice(0, mitte);
  const spaet = sortiert.slice(mitte);
  const anteil = (l: TiefenTrade[]) =>
    l.filter((t) => lagerVon(t.urteil) === "ohne").length / l.length;

  const a = anteil(frueh);
  const b = anteil(spaet);
  const verdaechtig = a - b >= ZEIT_GRENZE;
  const p = (v: number) => `${(v * 100).toFixed(0)} %`;

  return {
    anteilFrueh: a,
    anteilSpaet: b,
    trennDatum: spaet[0].datum,
    verdaechtig,
    satz: verdaechtig
      ? `In der ersten Haelfte (bis ${frueh[frueh.length - 1].datum}) haben ${p(a)} der `
        + `Trades kein Urteil, danach nur noch ${p(b)}. Die Aufteilung folgt damit auch `
        + `der Datenlage und nicht nur der Fundamentallage — der Vergleich oben `
        + `vermischt beides.`
      : `"Kein Urteil" verteilt sich gleichmaessig ueber die Zeit (${p(a)} frueh, `
        + `${p(b)} spaet). Die Aufteilung ist also keine verkappte Zeitachse.`,
  };
}

/* ------------------------------------------------- Kandidaten fürs Anschauen */

export interface Auffaellig {
  titel: string;
  grund: string;
  trades: TiefenTrade[];
}

/**
 * Die Trades, bei denen sich ein Blick in den Chart wirklich lohnt.
 *
 * Bewusst nur zwei kleine Gruppen statt „alle SL": ein Screenshot beantwortet
 * keine Frage, die man nicht vorher gestellt hat. Die beiden Gruppen hier sind
 * die Widersprüche — dort steht die Zahl gegen das Ergebnis, und nur dort kann
 * das Bild etwas erklären, was die Tabelle nicht schon sagt.
 *
 * `stopKey` und `zielKey` kommen von aussen, damit dieses Modul die Ergebnis-
 * Schlüssel des Backtest-Journals nicht kennen muss.
 */
export function auffaellige(
  trades: TiefenTrade[], stopKey: string, zielKey: string, proGruppe = 8,
): Auffaellig[] {
  const mitLink = (liste: TiefenTrade[]) =>
    liste.filter((t) => t.link !== null).slice(0, proGruppe);

  const stopTrotzRueckenwind = trades.filter(
    (t) => t.ergebnis === stopKey && lagerVon(t.urteil) === "rueckenwind");
  const zielTrotzGegenwind = trades.filter(
    (t) => t.ergebnis === zielKey && lagerVon(t.urteil) === "gegenwind");

  return [
    {
      titel: "Stop trotz Rückenwind",
      grund: "Die Lage sprach dafür und der Trade lief trotzdem in den Stop. "
        + "Hier zeigt sich, ob es am Einstieg lag oder ob die Lage nur auf dem Papier stimmte.",
      trades: mitLink(stopTrotzRueckenwind),
    },
    {
      titel: "Volles Ziel gegen die Lage",
      grund: "Gegen die Fundamentallage voll durchgelaufen. Zu viele davon heissen: "
        + "der Filter misst für dieses Paar etwas anderes als gedacht.",
      trades: mitLink(zielTrotzGegenwind),
    },
  ].filter((g) => g.trades.length > 0);
}
