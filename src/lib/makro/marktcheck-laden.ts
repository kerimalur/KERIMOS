import "server-only";
import { unstable_cache } from "next/cache";
import { fetchIntraday } from "@/lib/marktdaten/quellen/oanda";
import { marktCheck, paareFuer, type IntraKerze, type MarktCheck } from "./marktcheck";

/**
 * Kerzen für den Markt-Check holen (02.10.2026). M15 von 15 Minuten vor
 * der Zahl bis gut 4 Stunden danach, je Paar der Währung. Abgeschlossene
 * Fenster ändern sich nicht mehr → einen Tag im Cache; frische Zahlen nur
 * 5 Minuten. Ohne OANDA_API_KEY gibt es keinen Check, und nichts bricht.
 */
const kerzenCached = unstable_cache(
  async (instrument: string, ab: string): Promise<IntraKerze[]> => {
    try {
      const k = await fetchIntraday(instrument, "M15", ab, 20);
      return k.map(({ zeit, open, close }) => ({ zeit, open, close }));
    } catch {
      return [];
    }
  },
  ["makro-marktcheck"],
  { revalidate: 300, tags: ["makro-marktcheck"] },
);

export interface CheckAuftrag { id: string; ccy: string; event_time: string; richtung: 1 | -1 | 0 | null }

export function marktcheckVerfuegbar(): boolean {
  return Boolean(process.env.OANDA_API_KEY);
}

/** Markt-Checks für vergangene Termine; höchstens `max`, jüngste zuerst. */
export async function ladeMarktChecks(auftraege: CheckAuftrag[], max = 8): Promise<Record<string, MarktCheck>> {
  if (!marktcheckVerfuegbar()) return {};
  const jetzt = Date.now();
  const auswahl = auftraege
    .filter((a) => Date.parse(a.event_time) <= jetzt - 15 * 60_000)
    .sort((a, b) => b.event_time.localeCompare(a.event_time))
    .slice(0, max);
  const out: Record<string, MarktCheck> = {};
  await Promise.all(auswahl.map(async (a) => {
    const ab = new Date(Date.parse(a.event_time) - 15 * 60_000).toISOString();
    const paare = paareFuer(a.ccy);
    const kerzen = await Promise.all(paare.map((p) => kerzenCached(p.instrument, ab)));
    const jePaar: Record<string, IntraKerze[]> = {};
    paare.forEach((p, i) => { jePaar[p.instrument] = kerzen[i]; });
    out[a.id] = marktCheck(a.ccy, a.event_time, jePaar, a.richtung);
  }));
  return out;
}
