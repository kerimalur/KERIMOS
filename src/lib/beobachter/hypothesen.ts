import {
  HORIZONT_NAME, KOSTEN_PROZENT, bewerte, proben,
  type Ereignis, type GruppeErgebnis, type Horizont,
} from "./rechnen";

/**
 * Der Prüfstand (11.10.2026): feste Fragen, vorab festgelegt.
 *
 * Wer hunderte Gruppen durchsucht, findet immer etwas. Darum steht hier eine
 * kleine Liste von Hypothesen mit festem Horizont und fester Schwelle — sie
 * werden nie nachträglich angepasst. Jede bekommt ein Urteil:
 *  - bestätigt: ≥ 50 Fälle, |t| ≥ 3 in der erwarteten Richtung, beide Zeithälften gleich,
 *    und der Betrag der Bewegung liegt über den Kosten.
 *  - widerlegt: ≥ 100 Fälle, aber t in der erwarteten Richtung unter 1, oder der Vorteil
 *    liegt unter den Kosten (nicht handelbar).
 *  - offen: dazwischen — mit Schätzung, wie viele Fälle noch fehlen.
 */

export interface Hypothese {
  id: string;
  titel: string;
  frage: string;
  horizont: Horizont;
  /** „folgt": Markt läuft in Richtung der Überraschung. „dagegen": er kehrt um. */
  richtung: "folgt" | "dagegen";
  minZ: number;
  filter?: (e: Ereignis) => boolean;
}

export const HYPOTHESEN: Hypothese[] = [
  {
    id: "H1", titel: "Inflation, starke Überraschung", horizont: "4h", richtung: "folgt", minZ: 2,
    frage: "Läuft der Markt nach einer deutlichen Inflationsüberraschung in deren Richtung weiter?",
    filter: (e) => e.kategorie === "inflation",
  },
  {
    id: "H2", titel: "Arbeitsmarkt, starke Überraschung", horizont: "4h", richtung: "folgt", minZ: 2,
    frage: "Folgt der Markt einer deutlichen Arbeitsmarktüberraschung?",
    filter: (e) => e.kategorie === "arbeit",
  },
  {
    id: "H3", titel: "Wachstum/PMI, starke Überraschung", horizont: "1d", richtung: "folgt", minZ: 2,
    frage: "Folgt der Markt einer deutlichen Wachstums- oder PMI-Überraschung bis zum Tagesschluss?",
    filter: (e) => e.kategorie === "wachstum",
  },
  {
    id: "H4", titel: "Alle starken Überraschungen", horizont: "1d", richtung: "folgt", minZ: 2,
    frage: "Gibt es über alle Meldungen hinweg einen Tagesvorteil nach starken Überraschungen?",
  },
  {
    id: "H5", titel: "Extreme Überraschungen kehren um", horizont: "3d", richtung: "dagegen", minZ: 3,
    frage: "Kehrt der Markt nach extremen Überraschungen (|z| ≥ 3) innerhalb von 3 Tagen um (Überreaktion)?",
  },
  {
    id: "H6", titel: "Mit dem Trend läuft es weiter", horizont: "1d", richtung: "folgt", minZ: 1,
    frage: "Läuft eine Überraschung weiter, wenn sie in die Richtung des 5-Tage-Trends der Währung zeigt?",
    filter: (e) => e.vorlauf_5 !== null && Math.sign(e.vorlauf_5) === Math.sign(e.z) && Math.abs(e.vorlauf_5) > 0,
  },
];

export type Urteil = "bestaetigt" | "widerlegt" | "offen";
export const URTEIL_TEXT: Record<Urteil, string> = { bestaetigt: "bestätigt", widerlegt: "widerlegt", offen: "offen" };

export interface HypothesenErgebnis {
  h: Hypothese;
  ergebnis: GruppeErgebnis;
  urteil: Urteil;
  begruendung: string;
  /** Geschätzte Fälle, bis |t| = 3 erreicht wäre, wenn der Effekt bleibt. Null = nicht absehbar. */
  fehlendeFaelle: number | null;
}

export function pruefeHypothese(ereignisse: Ereignis[], h: Hypothese): HypothesenErgebnis {
  const e = bewerte(proben(ereignisse, h.horizont, h.minZ, h.filter));
  const ergebnis: GruppeErgebnis = { schluessel: h.id, titel: h.titel, ...e };
  const vorz = h.richtung === "folgt" ? 1 : -1;
  const tRichtig = (ergebnis.t ?? 0) * vorz;
  const nettoRichtig = Math.abs(ergebnis.mittel) - KOSTEN_PROZENT;
  const richtungOk = ergebnis.mittel * vorz > 0;
  const zeitraum = HORIZONT_NAME[h.horizont];

  let urteil: Urteil = "offen";
  let begruendung: string;
  const schaetzung = tRichtig > 0.3 && ergebnis.n > 0 ? Math.max(0, Math.ceil((3 / tRichtig) ** 2 * ergebnis.n) - ergebnis.n) : null;

  if (ergebnis.n < 30) {
    begruendung = `Erst ${ergebnis.n} Fälle — zu wenig für ein Urteil (ab 30 sichtbar, ab 50 prüfbar).`;
  } else if (ergebnis.status === "stabil" && richtungOk && nettoRichtig > 0) {
    urteil = "bestaetigt";
    begruendung = `Hält in beiden Zeithälften: Ø ${ergebnis.mittel > 0 ? "+" : ""}${ergebnis.mittel.toFixed(3)} % nach ${zeitraum}, t = ${ergebnis.t}, nach Kosten ${nettoRichtig.toFixed(3)} % je Fall.`;
  } else if (ergebnis.n >= 100 && (!richtungOk || tRichtig < 1 || nettoRichtig <= 0)) {
    urteil = "widerlegt";
    begruendung = nettoRichtig <= 0 && richtungOk && tRichtig >= 1
      ? `Es gibt eine Tendenz (t = ${ergebnis.t}), aber sie liegt unter den Kosten (Ø ${Math.abs(ergebnis.mittel).toFixed(3)} % gegen ${KOSTEN_PROZENT} %) — nicht handelbar.`
      : `Kein nachweisbarer Zusammenhang nach ${ergebnis.n} Fällen (t = ${ergebnis.t ?? "–"}, Ø ${ergebnis.mittel > 0 ? "+" : ""}${ergebnis.mittel.toFixed(3)} %).`;
  } else {
    begruendung = `Noch unklar (t = ${ergebnis.t ?? "–"}, ${ergebnis.n} Fälle).`
      + (schaetzung !== null ? ` Bei gleichem Effekt bräuchte es etwa ${schaetzung} weitere Fälle für Klarheit.` : " Effekt aktuell zu klein, um eine Frist zu nennen.");
  }
  return { h, ergebnis, urteil, begruendung, fehlendeFaelle: urteil === "offen" ? schaetzung : null };
}

export function pruefstand(ereignisse: Ereignis[]): HypothesenErgebnis[] {
  return HYPOTHESEN.map((h) => pruefeHypothese(ereignisse, h));
}

export function fazit(r: HypothesenErgebnis[]): string {
  const b = r.filter((x) => x.urteil === "bestaetigt").length;
  const w = r.filter((x) => x.urteil === "widerlegt").length;
  const o = r.length - b - w;
  if (b > 0) return `${b} von ${r.length} Fragen bestätigt — daraus lässt sich eine Regel prüfen (zuerst mit Demo-Größe handeln).`;
  if (w === r.length) return `Alle ${r.length} Fragen widerlegt: Wirtschaftsmeldungen geben als Handelssignal keinen Vorteil. Das ist Klarheit — Zeit lohnt sich woanders.`;
  return `Noch nichts bestätigt: ${w} widerlegt, ${o} offen. Solange keine Frage „bestätigt" ist, gilt: kein Handel auf Basis der Meldungen.`;
}
