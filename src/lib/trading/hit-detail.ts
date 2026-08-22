import "server-only";
import { heuteISO } from "@/lib/time";
import { checkFundamental, fetchRanking, type FundamentalCheck } from "@/lib/supabase/trading";
import { ladeFuerStichtag, ladeKurse } from "@/lib/confluence/daten";
import { cotBildFuer, type CotBild } from "@/lib/confluence/cot-divergenz";
import { saisonZum, MONATS_KURZ, type MonatsBild } from "@/lib/confluence/saison";
import { holeTageskerzen, zu3D, zuWoche, erkenneZeitrahmen, type Kerze, type Zeitrahmen }
  from "@/lib/trading/kerzen";

/**
 * Alles, was im Cockpit-Popup zu einem GVA-Hit steht.
 *
 * Bewusst EIN Ladepfad statt drei Panels, die sich einzeln nachladen: das
 * Popup soll entweder ganz da sein oder ehrlich sagen, dass etwas fehlt.
 * Halbgefüllte Karten sind die Art von Anzeige, bei der man irgendwann nicht
 * mehr weiss, ob "—" bedeutet "neutral" oder "nicht geladen".
 *
 * Geladen wird erst beim Öffnen (über die Route `/api/trading/hit-detail`),
 * nicht schon beim Rendern des Rasters. Die Saisonalität zieht rund 5000
 * Tagesschlüsse je Paar; das für alle offenen Hits im Voraus zu tun, würde die
 * Cockpit-Seite genau um das langsamer machen, was Kerim meistens gar nicht
 * aufklappt.
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

export interface HitDetail {
  paar: string;
  seite: "long" | "short";
  level: number;
  formiertAm: string | null;
  chart: ChartBild | null;
  /** Das allgemeine Ranking — dieselbe Quelle wie das Badge im Raster. */
  ranking: FundamentalCheck;
  rankingSatz: string;
  /** Monty: Commercials gegen Retail, je Währung des Paares. */
  cotBasis: CotBild | null;
  cotKurs: CotBild | null;
  cotSatz: string;
  /** Monty: was dieser Kalendermonat historisch gemacht hat. */
  saison: MonatsBild | null;
  saisonSatz: string;
}

/* ------------------------------------------------------------------ Chart */

/**
 * Der Chart, wie er zum Zeitpunkt der Entstehung aussah.
 *
 * Absichtlich endet er wenige Kerzen NACH der Bildung und nicht heute: Kerim
 * will sehen, woraus die Linie entstanden ist, nicht wie sie ausgegangen ist.
 * Ein Chart bis heute würde die Antwort mitliefern und die Entscheidung
 * "beobachten oder verwerfen" wertlos machen.
 */
async function baueChart(
  paar: string, seite: "long" | "short", level: number, formiertAm: string,
): Promise<ChartBild | null> {
  // Vorlauf grosszügig: 18 Wochenkerzen sind rund 130 Wochen Tagesdaten, und
  // der Zeitrahmen steht erst fest, wenn die Kerzen da sind.
  const seit = new Date(Date.parse(formiertAm + "T00:00:00Z") - 400 * 86_400_000)
    .toISOString().slice(0, 10);

  const tage = await holeTageskerzen(paar, seit);
  if (tage.length === 0) return null;

  const zeitrahmen = erkenneZeitrahmen(tage, formiertAm, level, seite);
  const alle = zeitrahmen === "W" ? zuWoche(tage) : zu3D(tage);
  if (alle.length === 0) return null;

  // Die bildende Kerze ist die letzte, die am Bildungstag oder davor beginnt.
  // Nicht `=== formiertAm`: bei Feiertagen beginnt ein Block einen Tag später,
  // als das Datum vermuten lässt.
  let idx = -1;
  for (let i = 0; i < alle.length; i++) if (alle[i].zeit <= formiertAm) idx = i;
  if (idx < 0) return null;

  const von = Math.max(0, idx - CHART_VORLAUF);
  const bis = Math.min(alle.length, idx + CHART_NACHLAUF + 1);

  return {
    zeitrahmen,
    kerzen: alle.slice(von, bis),
    bildendeKerze: idx - von,
    level, seite, formiertAm,
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
  basis: CotBild | null, kurs: CotBild | null, seite: "long" | "short",
): string {
  if (!basis || !kurs) return "Keine COT-Historie für dieses Paar.";
  const wunsch = seite === "long" ? 1 : -1;
  const beitrag = (basis.divergenz as number) - (kurs.divergenz as number);
  if (beitrag === 0) return "Weder Commercials noch Retail stehen am Rand — Monty sagt hier nichts.";
  return beitrag * wunsch > 0
    ? `Monty stützt die Richtung: ${basis.text} ${kurs.text}`
    : `Monty spricht dagegen: ${basis.text} ${kurs.text}`;
}

function saisonText(m: MonatsBild | null, seite: "long" | "short"): string {
  if (!m) return "Zu wenig Kurshistorie für eine Saison-Aussage.";
  if (!m.belegt) {
    return `${MONATS_KURZ[m.monat - 1]} ist statistisch nicht belegt — `
      + "die Trefferquote lässt sich nicht von einem Münzwurf unterscheiden.";
  }
  const richtung = m.richtung > 0 ? "gestiegen" : "gefallen";
  const passt = (m.richtung > 0) === (seite === "long");
  return `${MONATS_KURZ[m.monat - 1]} ist historisch belegt ${richtung} `
    + `(${m.jahre} Jahre) — das spricht ${passt ? "für" : "gegen"} diese Richtung.`;
}

/* ---------------------------------------------------------------- Aufbau */

export async function baueHitDetail(
  paar: string, seite: "long" | "short", level: number, formiertAm: string | null,
): Promise<HitDetail> {
  const sauber = paar.replace(/[^A-Za-z]/g, "").toUpperCase();
  const heute = heuteISO();
  const basisCode = sauber.slice(0, 3);
  const kursCode = sauber.slice(3, 6);

  const [ranking, cotDaten, kurse, chart] = await Promise.all([
    fetchRanking(),
    ladeFuerStichtag(heute).catch(() => null),
    ladeKurse(sauber).catch(() => []),
    formiertAm ? baueChart(sauber, seite, level, formiertAm).catch(() => null) : null,
  ]);

  const check = checkFundamental(sauber, seite === "long" ? "LONG" : "SHORT", ranking);
  const cotBasis = cotDaten ? cotBildFuer(cotDaten.daten, basisCode, heute) : null;
  const cotKurs = cotDaten ? cotBildFuer(cotDaten.daten, kursCode, heute) : null;
  const saison = kurse.length > 0 ? saisonZum(kurse, heute, SAISON_FENSTER) : null;

  return {
    paar: sauber, seite, level, formiertAm, chart,
    ranking: check,
    rankingSatz: rankingText(check),
    cotBasis, cotKurs,
    cotSatz: cotText(cotBasis, cotKurs, seite),
    saison,
    saisonSatz: saisonText(saison, seite),
  };
}
