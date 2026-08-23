/**
 * Klartext für die Feature-Namen der ML-Engine.
 *
 * `ml_weekly_rankings.top_features` liefert die Spaltennamen des
 * Feature-Panels (`Backend/macro_features/panel.py`) — technisch korrekt und
 * beim Lesen wertlos: „comm_z: −0.31" beantwortet die Frage nicht, warum eine
 * Währung im untersten Fünftel steht. Hier steht daneben, was gemeint ist.
 *
 * Bewusst mit Rückfallebene statt mit einer erschöpfenden Liste: das Panel
 * bekommt Spalten dazu, wenn am Modell gearbeitet wird, und ein unbekannter
 * Name soll dann lesbar durchgereicht werden statt zu verschwinden.
 *
 * Reine Funktion, kein Ladepfad — prüfbar über tools/checks/faktor-namen.mts.
 */

export interface FaktorText {
  /** Kurzer Name für die Zeile. */
  label: string;
  /** Ein Satz, was der Faktor misst. Leer, wenn unbekannt. */
  erklaerung: string;
}

const NAMEN: Record<string, FaktorText> = {
  rates_score: {
    label: "Zinslage",
    erklaerung: "Zinsniveau und Zinsrichtung dieser Währung gegenüber den sieben anderen.",
  },
  rate_diff_avg: {
    label: "Zinsdifferenz",
    erklaerung: "Durchschnittlicher Zinsvorsprung gegenüber den anderen Währungen.",
  },
  rate_mom_6m: {
    label: "Zinsrichtung 6 Monate",
    erklaerung: "Wohin sich der Leitzins im letzten halben Jahr bewegt hat.",
  },
  rate_level: {
    label: "Leitzins",
    erklaerung: "Der absolute Leitzins der Notenbank.",
  },
  season_score: {
    label: "Saisonalität",
    erklaerung: "Was dieser Kalendermonat für diese Währung historisch gebracht hat.",
  },
  season_mean_ret: {
    label: "Saison-Rendite",
    erklaerung: "Durchschnittliche Rendite dieses Monats über die ausgewerteten Jahre.",
  },
  season_hit_years: {
    label: "Saison-Trefferjahre",
    erklaerung: "In wie vielen Jahren dieser Monat in dieselbe Richtung lief.",
  },
  season_n_years: {
    label: "Saison-Stichprobe",
    erklaerung: "Wie viele Jahre überhaupt in die Saison-Rechnung eingingen.",
  },
  cot_score: {
    label: "COT (Commercials)",
    erklaerung: "Positionierung der Commercials, gedreht — sie stehen gegen die Menge.",
  },
  comm_z: {
    label: "Commercials, standardisiert",
    erklaerung: "Wie weit die Netto-Position der Commercials von ihrem eigenen Mittel abweicht.",
  },
  comm_net: {
    label: "Commercials netto",
    erklaerung: "Netto-Position der Commercials als Anteil des Open Interest.",
  },
  cot_divergence: {
    label: "Commercials gegen Retail",
    erklaerung: "Wie weit die grossen Halter und die Kleinspekulanten auseinanderstehen.",
  },
  retail: {
    label: "Retail-Position",
    erklaerung: "Netto-Position der Nicht-Meldepflichtigen — der Retail-Proxy am Terminmarkt.",
  },
  open_interest: {
    label: "Open Interest",
    erklaerung: "Wie viele Kontrakte insgesamt offen sind — das Gewicht hinter den Positionen.",
  },
  lev: {
    label: "Leveraged Funds",
    erklaerung: "Netto-Position der Hedgefonds.",
  },
  asset: {
    label: "Asset Manager",
    erklaerung: "Netto-Position der Asset Manager — Real Money dreht langsamer als die Fonds.",
  },
  dealer: {
    label: "Dealer (Banken)",
    erklaerung: "Netto-Position der Banken. Rechnerisch die Gegenseite der anderen Gruppen.",
  },
};

/**
 * "rate_mom_6m" → { label: "Zinsrichtung 6 Monate", … }
 *
 * Unbekannte Namen werden lesbar gemacht statt weggelassen: Unterstriche zu
 * Leerzeichen, erster Buchstabe gross. Wer im Panel eine Spalte ergänzt, sieht
 * sie damit sofort — nur eben ohne Erklärsatz.
 */
export function faktorText(feature: string): FaktorText {
  const treffer = NAMEN[feature];
  if (treffer) return treffer;
  const lesbar = feature.replace(/_/g, " ").trim();
  return {
    label: lesbar.charAt(0).toUpperCase() + lesbar.slice(1),
    erklaerung: "",
  };
}
