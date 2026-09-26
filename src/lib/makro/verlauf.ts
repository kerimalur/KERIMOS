import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ladeFuerStichtag } from "@/lib/confluence/daten";
import { heuteISO } from "@/lib/time";
import { istVeraltet, type HandWert } from "./bewertung";

/**
 * Der Verlauf einer Währung — alle Kennzahlen als Zeitreihe (26.09.2026).
 *
 * Kerims Wunsch: ein Klick auf eine Währung führt auf eine eigene Seite,
 * die wie Trading Economics die Veränderung zeigt — letztes halbes Jahr,
 * letztes Jahr — nur mit schöneren Grafiken.
 *
 * Zwei Quellen:
 *   makro_reihen (Kompass)   Frühindikator, PMI, BIP, Arbeitslosenquote,
 *                            10J-Rendite, Leistungsbilanz, Staatsschulden
 *   Trading-DB (Screener)    Leitzins, Inflation, 2J-Rendite, COT
 * Von Hand gepflegte Einzelwerte (makro_werte) ergänzen, wo keine Reihe da ist.
 */

export type Gruppe = "Wirtschaft" | "Zinsen & Notenbank" | "Positionierung" | "Kontext";

export interface Punkt { datum: string; wert: number }

export interface Indikator {
  key: string;
  label: string;
  einheit: string;
  gruppe: Gruppe;
  /** Was eine Bewegung bedeutet — färbt die Veränderung. */
  besser: "hoch" | "tief" | "neutral";
  /** Waagrechte Hilfslinie, z.B. 50 beim PMI. */
  referenz?: { wert: number; text: string };
  /** Treppe statt Kurve — ein Leitzins springt, er gleitet nicht. */
  stufe?: boolean;
  punkte: Punkt[];
  quelle: string | null;
  /** Feld in makro_* — für Veraltet-Prüfung und Link zum manuellen Holen. */
  feld?: string;
  status: "ok" | "veraltet" | "fehlt";
  /** Ein Satz zur Einordnung. */
  hinweis: string;
}

const DEF: Omit<Indikator, "punkte" | "quelle" | "status">[] = [
  { key: "pmi_industrie", feld: "pmi_industrie", label: "PMI Industrie", einheit: "", gruppe: "Wirtschaft",
    besser: "hoch", referenz: { wert: 50, text: "50 = Wachstumsschwelle" },
    hinweis: "Über 50 wächst die Industrie, darunter schrumpft sie." },
  { key: "pmi_dienste", feld: "pmi_dienste", label: "PMI Dienste", einheit: "", gruppe: "Wirtschaft",
    besser: "hoch", referenz: { wert: 50, text: "50 = Wachstumsschwelle" },
    hinweis: "Dienstleistungen sind in den meisten Ländern der grössere Teil der Wirtschaft." },
  { key: "bip_yoy", feld: "bip_yoy", label: "BIP zum Vorjahr", einheit: "%", gruppe: "Wirtschaft",
    besser: "hoch", referenz: { wert: 0, text: "0 % = Stillstand" },
    hinweis: "Reales Wachstum gegenüber dem Vorjahresquartal." },
  { key: "arbeitslos", feld: "arbeitslos", label: "Arbeitslosenquote", einheit: "%", gruppe: "Wirtschaft",
    besser: "tief", hinweis: "Die Richtung zählt: steigt sie, senkt die Notenbank irgendwann." },
  { key: "fruehindikator", feld: "fruehindikator", label: "OECD-Frühindikator", einheit: "", gruppe: "Wirtschaft",
    besser: "hoch", referenz: { wert: 100, text: "100 = Trend" },
    hinweis: "Über 100 und steigend: die Konjunktur zieht an." },
  { key: "handelsbilanz", feld: "handelsbilanz", label: "Leistungsbilanz", einheit: "% BIP", gruppe: "Wirtschaft",
    besser: "hoch", referenz: { wert: 0, text: "ausgeglichen" },
    hinweis: "Überschuss = laufende Nachfrage nach der Währung." },
  { key: "leitzins", label: "Leitzins", einheit: "%", gruppe: "Zinsen & Notenbank", besser: "hoch", stufe: true,
    hinweis: "Beschluss der Notenbank. Steigend stützt die Währung." },
  { key: "inflation", label: "Inflation", einheit: "%", gruppe: "Zinsen & Notenbank", besser: "neutral",
    referenz: { wert: 2, text: "2 % = Ziel der meisten Notenbanken" },
    hinweis: "Über dem Ziel hält den Zins oben, darunter lädt zu Senkungen ein." },
  { key: "zweijahr", label: "2-Jahres-Rendite", einheit: "%", gruppe: "Zinsen & Notenbank", besser: "hoch",
    hinweis: "Was der Markt für die nächsten zwei Jahre an Zinsen erwartet." },
  { key: "rendite_10j", feld: "rendite_10j", label: "10-Jahres-Rendite", einheit: "%", gruppe: "Zinsen & Notenbank",
    besser: "hoch", hinweis: "Langfristige Rendite der Staatsanleihen." },
  { key: "cot", label: "COT · Leveraged Funds", einheit: "% OI", gruppe: "Positionierung", besser: "neutral",
    referenz: { wert: 0, text: "netto neutral" },
    hinweis: "Netto-Position der Fonds in % des Open Interest. Extreme sind Warnsignale." },
  { key: "cot_real", label: "COT · Asset Manager", einheit: "% OI", gruppe: "Positionierung", besser: "neutral",
    referenz: { wert: 0, text: "netto neutral" },
    hinweis: "Real Money dreht langsamer als die Fonds." },
  { key: "staatsschulden", feld: "staatsschulden", label: "Staatsschulden", einheit: "% BIP", gruppe: "Kontext",
    besser: "tief", hinweis: "Nur Kontext, zählt nicht ins Urteil." },
];

/** Periodenlänge in Monaten aus dem Abstand der letzten zwei Punkte. */
function periodeAus(p: Punkt[]): number {
  if (p.length < 2) return 1;
  const a = Date.parse(p[p.length - 1].datum), b = Date.parse(p[p.length - 2].datum);
  return Math.max(1, Math.round((a - b) / (30.44 * 86_400_000)));
}

export async function ladeVerlauf(ccy: string): Promise<Indikator[]> {
  const supabase = await createClient();
  const [reihen, hand, markt] = await Promise.all([
    supabase.from("makro_reihen").select("feld, datum, wert, serie").eq("ccy", ccy)
      .order("datum", { ascending: true }).limit(1000),
    supabase.from("makro_werte").select("feld, wert, vorwert, stand, quelle").eq("ccy", ccy),
    ladeFuerStichtag(heuteISO()).catch(() => null),
  ]);

  const jeFeld = new Map<string, { punkte: Punkt[]; serie: string }>();
  for (const r of (reihen.data ?? []) as { feld: string; datum: string; wert: number; serie: string }[]) {
    const e = jeFeld.get(r.feld) ?? { punkte: [], serie: r.serie };
    e.punkte.push({ datum: String(r.datum).slice(0, 10), wert: Number(r.wert) });
    e.serie = r.serie;
    jeFeld.set(r.feld, e);
  }
  const handJe = new Map(((hand.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.feld), r]));

  const d = markt?.daten;
  const marktReihe = (key: string): Punkt[] => {
    const r = key === "leitzins" ? d?.leitzins[ccy]
      : key === "inflation" ? d?.cpi[ccy]
        : key === "zweijahr" ? d?.zwei?.[ccy]
          : key === "cot" ? d?.cot[ccy]
            : key === "cot_real" ? d?.cotRealMoney?.[ccy] : undefined;
    // COT kommt als Anteil (0.12) — auf der Seite in Prozent.
    const faktor = key.startsWith("cot") ? 100 : 1;
    return (r ?? []).map((p) => ({ datum: p.datum, wert: p.wert * faktor }));
  };
  const marktQuelle: Record<string, string> = {
    leitzins: "BIS · Notenbanksatz", inflation: "BIS · CPI zum Vorjahr",
    zweijahr: "Trading-DB · 2J-Rendite", cot: "CFTC · Traders in Financial Futures",
    cot_real: "CFTC · Traders in Financial Futures",
  };

  return DEF.map((def) => {
    let punkte: Punkt[] = [];
    let quelle: string | null = null;

    if (def.feld) {
      const r = jeFeld.get(def.feld);
      if (r) {
        punkte = r.punkte;
        quelle = r.serie.includes("·") ? r.serie : `FRED · ${r.serie}`;
      }
      // Ein von Hand gepflegter Wert, der neuer ist als die Reihe, wird als
      // letzter Punkt angehängt — sonst sähe man ihn im Verlauf nie.
      const h = handJe.get(def.feld);
      if (h && h.wert !== null && h.stand) {
        const stand = String(h.stand).slice(0, 10);
        const letzter = punkte[punkte.length - 1]?.datum ?? "";
        if (stand > letzter) {
          punkte = [...punkte, { datum: stand, wert: Number(h.wert) }];
          quelle = `von Hand${h.quelle ? ` · ${h.quelle}` : ""}`;
        }
      }
    } else {
      punkte = marktReihe(def.key);
      quelle = punkte.length ? marktQuelle[def.key] : null;
    }

    let status: Indikator["status"] = punkte.length === 0 ? "fehlt" : "ok";
    if (def.feld && punkte.length > 0) {
      const letzter = punkte[punkte.length - 1];
      const hw: HandWert = {
        wert: letzter.wert, vorwert: punkte[punkte.length - 2]?.wert ?? null,
        stand: letzter.datum, quelle, periode: periodeAus(punkte),
      };
      if (istVeraltet(def.feld, hw)) status = "veraltet";
    }

    return { ...def, punkte, quelle, status };
  });
}
