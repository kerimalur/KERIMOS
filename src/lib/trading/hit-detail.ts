import "server-only";
import { heuteISO } from "@/lib/time";
import { checkFundamental, fetchRanking, type FundamentalCheck } from "@/lib/supabase/trading";
import { ladeFuerStichtag, ladeKurse } from "@/lib/confluence/daten";
import { cotBildFuer, type CotBild } from "@/lib/confluence/cot-divergenz";
import { saisonZum, MONATS_KURZ, type MonatsBild } from "@/lib/confluence/saison";
import { holeTageskerzen, zu3D, zuWoche, erkenneZeitrahmen, type Kerze, type Zeitrahmen }
  from "@/lib/trading/kerzen";

/**
 * Was im Cockpit-Popup zu einem GVA-Hit steht.
 *
 * **Zwei Teile, zwei Aufrufe.** Der Chart braucht Kerzen von OANDA (über das
 * Screener-Backend auf Render), die Lage braucht COT, Kurse und das Ranking
 * aus Supabase. Beides in einem Aufruf hiess: das Popup zeigt nichts, bis das
 * Langsamste fertig ist — und wenn eine der beiden Quellen zickt, bleibt auch
 * die andere leer. Getrennt erscheint jeder Teil, sobald er da ist.
 *
 * **Fehler werden gemeldet, nicht verschluckt.** Ein leeres Feld sagt nicht,
 * ob es „neutral" heisst oder „nicht geladen". Deshalb trägt jeder Teil ein
 * `fehler`-Feld, und die Anzeige schreibt hin, was los war.
 */

const SAISON_FENSTER = 15 as const;

/** Wie viele Kerzen vor und nach der bildenden Kerze der Chart zeigt. */
export const CHART_VORLAUF = 18;
export const CHART_NACHLAUF = 4;

export interface ChartBild {
  zeitrahmen: Zeitrahmen;
  kerzen: Kerze[];
  /** Position der bildenden Kerze in `kerzen`. −1, wenn nicht gefunden. */
  bildendeKerze: number;
  level: number;
  seite: "long" | "short";
  formiertAm: string;
}

export interface HitChart {
  chart: ChartBild | null;
  fehler: string | null;
}

/** Eine Währung im COT: wo stehen Commercials, wo Retail. */
export interface CotSeite {
  ccy: string;
  kommRang: number | null;
  retailRang: number | null;
  divergenz: -1 | 0 | 1;
  text: string;
  datum: string | null;
}

export interface HitLage {
  paar: string;
  seite: "long" | "short";
  /** Das allgemeine Ranking — dieselbe Quelle wie im Cockpit-Raster. */
  ranking: FundamentalCheck;
  rankingSatz: string;
  /** Monty: Commercials gegen Retail, je Währung des Paares. */
  cotBasis: CotSeite | null;
  cotKurs: CotSeite | null;
  cotSatz: string;
  cotFehler: string | null;
  /** Monty: was dieser Kalendermonat historisch gemacht hat. */
  saison: MonatsBild | null;
  saisonSatz: string;
  saisonFehler: string | null;
  stichtag: string;
}

/* ------------------------------------------------------------------ Chart */

/**
 * Der Chart, wie er zum Zeitpunkt der Entstehung aussah.
 *
 * Absichtlich endet er wenige Kerzen NACH der Bildung und nicht heute: Kerim
 * will sehen, woraus die Linie entstanden ist, nicht wie sie ausgegangen ist.
 * Ein Chart bis heute würde die Antwort mitliefern und die Entscheidung
 * „beobachten oder verwerfen" wertlos machen.
 */
export async function baueHitChart(
  paar: string, seite: "long" | "short", level: number, formiertAm: string | null,
): Promise<HitChart> {
  if (!formiertAm) {
    return {
      chart: null,
      fehler: "Zu diesem Signal ist kein Bildungsdatum gespeichert — Altbestand "
        + "aus der Zeit vor der Spalte line_formed_date.",
    };
  }

  const sauber = paar.replace(/[^A-Za-z]/g, "").toUpperCase();
  // Vorlauf grosszügig: 18 Wochenkerzen sind rund 130 Wochen Tagesdaten, und
  // der Zeitrahmen steht erst fest, wenn die Kerzen da sind.
  const seit = new Date(Date.parse(formiertAm + "T00:00:00Z") - 400 * 86_400_000)
    .toISOString().slice(0, 10);

  const tage = await holeTageskerzen(sauber, seit);
  if (tage.length === 0) {
    return {
      chart: null,
      fehler: "Keine Kerzen bekommen. Das Screener-Backend liegt auf Render und "
        + "schläft nach längerer Pause ein — gleich nochmal öffnen.",
    };
  }

  const zeitrahmen = erkenneZeitrahmen(tage, formiertAm, level, seite);
  const alle = zeitrahmen === "W" ? zuWoche(tage) : zu3D(tage);

  // Die bildende Kerze ist die letzte, die am Bildungstag oder davor beginnt.
  // Nicht `=== formiertAm`: bei Feiertagen beginnt ein Block einen Tag später,
  // als das Datum vermuten lässt.
  let idx = -1;
  for (let i = 0; i < alle.length; i++) if (alle[i].zeit <= formiertAm) idx = i;
  if (idx < 0) {
    return { chart: null, fehler: `Für den ${formiertAm} liegen keine Kerzen vor.` };
  }

  const von = Math.max(0, idx - CHART_VORLAUF);
  const bis = Math.min(alle.length, idx + CHART_NACHLAUF + 1);

  return {
    fehler: null,
    chart: {
      zeitrahmen,
      kerzen: alle.slice(von, bis),
      bildendeKerze: idx - von,
      level, seite, formiertAm,
    },
  };
}

/* --------------------------------------------------------------- Sätze */

function rankingText(f: FundamentalCheck): string {
  if (f.urteil === "unbekannt") return "Für dieses Paar liegt kein Wochen-Ranking vor.";
  const q = `${f.baseCode} Q${f.baseQ} · ${f.quoteCode} Q${f.quoteQ}`;
  if (f.urteil === "bestaetigt") return `Rückenwind — das Ranking zeigt in dieselbe Richtung (${q}).`;
  if (f.urteil === "dagegen") return `Gegenwind — das Ranking zeigt in die andere Richtung (${q}).`;
  return `Ohne Aussage: keine der beiden Währungen steht im Extrem (${q}).`;
}

/**
 * Monty in einem Satz. `divergenz` ist +1, wenn Commercials gestreckt long und
 * Retail gestreckt short stehen — also die Konstellation, auf die Kerim wartet.
 */
function cotText(
  basis: CotSeite | null, kurs: CotSeite | null, seite: "long" | "short",
): string {
  if (!basis || !kurs) return "Keine COT-Historie für dieses Paar.";
  const wunsch = seite === "long" ? 1 : -1;
  const beitrag = basis.divergenz - kurs.divergenz;
  if (beitrag === 0) {
    return "Keine der beiden Währungen ist gestreckt — Commercials und Retail "
      + "stehen beide im normalen Bereich. Monty sagt hier nichts.";
  }
  return beitrag * wunsch > 0
    ? `Monty stützt die Richtung. ${basis.text} ${kurs.text}`
    : `Monty spricht dagegen. ${basis.text} ${kurs.text}`;
}

function saisonText(m: MonatsBild | null, seite: "long" | "short"): string {
  if (!m) return "Zu wenig Kurshistorie für eine Saison-Aussage.";
  const monat = MONATS_KURZ[m.monat - 1];
  if (!m.belegt) {
    return `${monat} ist statistisch nicht belegt — bei ${m.jahre} Jahren lässt `
      + "sich die Trefferquote nicht von einem Münzwurf unterscheiden.";
  }
  const richtung = m.richtung > 0 ? "gestiegen" : "gefallen";
  const passt = (m.richtung > 0) === (seite === "long");
  return `${monat} ist über ${m.jahre} Jahre belegt ${richtung} — das spricht `
    + `${passt ? "für" : "gegen"} diese Richtung.`;
}

const alsSeite = (b: CotBild): CotSeite => ({
  ccy: b.ccy, kommRang: b.kommRang, retailRang: b.retailRang,
  divergenz: b.divergenz, text: b.text, datum: b.datum,
});

/* ---------------------------------------------------------------- Lage */

export async function baueHitLage(
  paar: string, seite: "long" | "short",
): Promise<HitLage> {
  const sauber = paar.replace(/[^A-Za-z]/g, "").toUpperCase();
  const heute = heuteISO();
  const basisCode = sauber.slice(0, 3);
  const kursCode = sauber.slice(3, 6);

  // `allSettled` statt `all`: eine hängende COT-Abfrage darf das Ranking nicht
  // mitreissen. Jeder Teil scheitert für sich und sagt, warum.
  const [rankingE, cotE, kurseE] = await Promise.allSettled([
    fetchRanking(),
    ladeFuerStichtag(heute),
    ladeKurse(sauber),
  ]);

  const ranking = rankingE.status === "fulfilled" ? rankingE.value : [];
  const check = checkFundamental(sauber, seite === "long" ? "LONG" : "SHORT", ranking);

  let cotBasis: CotSeite | null = null;
  let cotKurs: CotSeite | null = null;
  let cotFehler: string | null = null;
  if (cotE.status === "fulfilled") {
    cotBasis = alsSeite(cotBildFuer(cotE.value.daten, basisCode, heute));
    cotKurs = alsSeite(cotBildFuer(cotE.value.daten, kursCode, heute));
    // Beide Ränge leer heisst: die Reihen sind gar nicht angekommen. Das ist
    // eine Datenlücke und keine Aussage — und muss anders aussehen als
    // „geladen, aber neutral".
    if (cotBasis.kommRang === null && cotKurs.kommRang === null) {
      cotFehler = "Keine COT-Reihen für diese beiden Währungen geladen. Auf der "
        + "Monty-Seite steht, ob es an den Rohdaten oder am Bericht liegt.";
    }
  } else {
    cotFehler = "COT-Daten konnten nicht geladen werden.";
    console.error("hit-lage COT:", cotE.reason);
  }

  const kurse = kurseE.status === "fulfilled" ? kurseE.value : [];
  const saison = kurse.length > 0 ? saisonZum(kurse, heute, SAISON_FENSTER) : null;
  const saisonFehler = kurseE.status === "rejected"
    ? "Kurshistorie konnte nicht geladen werden."
    : kurse.length === 0 ? `Für ${sauber} liegen keine Tagesschlüsse in price_daily.` : null;

  return {
    paar: sauber, seite, stichtag: heute,
    ranking: check,
    rankingSatz: rankingE.status === "fulfilled"
      ? rankingText(check)
      : "Ranking konnte nicht geladen werden.",
    cotBasis, cotKurs, cotFehler,
    cotSatz: cotText(cotBasis, cotKurs, seite),
    saison, saisonFehler,
    saisonSatz: saisonText(saison, seite),
  };
}
