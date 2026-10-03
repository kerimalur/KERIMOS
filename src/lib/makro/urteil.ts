/**
 * Das Urteil je Währung — bullish bis bearish, mit Begründung (29.09.2026).
 *
 * Kerims Wunsch nach dem ersten Terminal: nicht erschlagen werden von 71
 * Reihen, sondern auf einen Blick sehen, welche Währung stark ist und WARUM.
 * Die Daten im Hintergrund bleiben dieselben; sie werden hier zu drei Teilen,
 * einem Urteil und drei bis fünf Sätzen verdichtet.
 *
 * Gewichtung (Claude, mit Kerim abgesprochen am 29.09.2026):
 *   Zentralbank 40 % — auf Kerims Zeitrahmen (3-Tages-Charts) bestimmt der
 *     Zinspfad die Richtung. Geld fliesst zur besseren Rendite, und es
 *     fliesst, bevor der Schritt da ist.
 *   Wirtschaft 35 % — sie treibt die Zentralbank. PMI zuerst, weil er
 *     vorausläuft; die Arbeitslosenquote hinkt und bestätigt nur.
 *   Überraschungen 25 % — eine einzelne Abweichung bewegt den Kurs Minuten
 *     bis Tage. Zählen tut sie, wenn sie sich wiederholt und damit den Kurs
 *     der Notenbank verschiebt; der Index gewichtet deshalb jüngere Termine
 *     stärker, aber über Monate.
 * Das ist eine begründete Setzung, kein gemessenes Optimum. Ob sie trägt,
 * soll das Journal zeigen (Urteil zum Einstieg gegen Ergebnis).
 *
 * Umstellung 03.10.2026 (Kerims Entscheid nach dem Varianten-Test): Das
 * Urteil rechnet nur noch mit der Wirtschaft (Ebene 1). Zentralbank und
 * Überraschungen werden weiter angezeigt, zählen aber nicht mehr. Im
 * Backtest März 2024 – Sept. 2026 traf das alte 40/35/25-Modell nach zwei
 * Wochen 46,8 %, die Zentralbank allein 43,9 %, die Wirtschaft allein
 * 56,8 %. Die alte Gewichtung bleibt als URTEIL_GEWICHT_ALT für den
 * Vergleich; ab MODELL_SEIT messen die Wochenideen das neue Modell vorwärts.
 *
 * Rein, ohne Datenbank — Seiten und Selbsttest rechnen damit.
 */
import type { WaehrungsBild, Teil } from "./bewertung";
import {
  entscheidUrteil, fmtWert, indexBis, type Kategorie, type Release,
} from "./releases";

export interface Gewichte { zentralbank: number; wirtschaft: number; ueberraschung: number }
/** Seit 03.10.2026: nur die Wirtschaft zählt. */
export const URTEIL_GEWICHT: Gewichte = { zentralbank: 0, wirtschaft: 1, ueberraschung: 0 };
/** Die Gewichtung bis 02.10.2026 — nur noch für den Vergleich im Makro-Backtest. */
export const URTEIL_GEWICHT_ALT: Gewichte = { zentralbank: 0.4, wirtschaft: 0.35, ueberraschung: 0.25 };
/** Erster Montag, dessen Wochenideen mit dem neuen Modell entstehen. */
export const MODELL_SEIT = "2026-10-05";
/** So steht die Gewichtung auf den Seiten und im Trade-Schnappschuss. */
export const GEWICHT_TEXT = "Wirtschaft 100 % · Zentralbank und Überraschungen nur Anzeige";

export type Ton = "gut" | "schlecht" | "neutral" | "fehlt";
export type UrteilWort = "bullish" | "leicht bullish" | "neutral" | "leicht bearish" | "bearish" | "keine Daten";

export const BANK: Record<string, string> = {
  USD: "Fed", EUR: "EZB", GBP: "BoE", JPY: "BoJ", AUD: "RBA", NZD: "RBNZ", CAD: "BoC", CHF: "SNB",
};

export interface Feld { ton: Ton; kurz: string; lang: string }

export interface Grund { ton: Ton; text: string; gewicht: number }

export interface Kernzahl {
  key: string;
  label: string;
  ebene: 1 | 2;
  /** Letzter Wert, formatiert. Leer, wenn er fehlt. */
  wert: string;
  datum: string | null;
  /** „höher als erwartet" / „wie erwartet" / „ohne Erwartung" … */
  vergleich: string;
  ton: Ton;
  /** Einordnung des Niveaus, z.B. „Expansion". */
  niveau: string | null;
  trend: "↑" | "↓" | "→" | null;
  /** Zeilen für das Pop-up: die Daten im Hintergrund. */
  details: string[];
  fehlt: string | null;
}

export interface UrteilBild {
  ccy: string;
  score: number | null;
  wort: UrteilWort;
  ton: Ton;
  teile: { zentralbank: number | null; wirtschaft: number | null; ueberraschung: number | null };
  felder: { wirtschaft: Feld; zentralbank: Feld; ueberraschung: Feld };
  gruende: Grund[];
  kern: Kernzahl[];
  /** Die auffälligste Abweichung der letzten 14 Tage, falls es eine gab. */
  nachricht: Release | null;
  /** Grosse Abweichungen der letzten 30 Tage, grösste zuerst. */
  grosse: Release[];
  schritt: string | null;
}

/* ------------------------------------------------------------ Helfer */

const TAG = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });
const tag = (iso: string) => TAG.format(new Date(iso));
const klemme = (x: number) => Math.max(-1, Math.min(1, x));
const tonAus = (x: number | null, grenze = 0.15): Ton =>
  x === null ? "fehlt" : x >= grenze ? "gut" : x <= -grenze ? "schlecht" : "neutral";

export function urteilWort(score: number | null): UrteilWort {
  if (score === null) return "keine Daten";
  if (score >= 0.35) return "bullish";
  if (score >= 0.12) return "leicht bullish";
  if (score > -0.12) return "neutral";
  if (score > -0.35) return "leicht bearish";
  return "bearish";
}

/** Wie stark eine Abweichung ist — in Worten, nicht als z. */
export function abweichungWort(z: number | null): string {
  if (z === null) return "ohne Erwartung";
  const a = Math.abs(z);
  if (a < 0.3) return "wie erwartet";
  return a >= 1.5 ? "klar" : a >= 0.8 ? "deutlich" : "leicht";
}

const wichtig = (r: Release) => r.impact === "High" || r.impact === "Medium";

/* ----------------------------------------------------- Zinsschritt */

/**
 * „Erhöhung auf 4.60 % erwartet (29.09)" — aus dem jüngsten Zinsentscheid,
 * der entweder noch kommt (14 Tage) oder schon war, aber noch kein Ist hat.
 * Die Leitzinsreihe (FRED/BIS) hinkt Tage bis Wochen hinterher; der Kalender
 * weiss es vorher.
 */
export function erwarteterSchritt(eigene: Release[], jetzt = Date.now()): string | null {
  const kandidaten = eigene.filter((r) => r.kategorie === "notenbank" && r.erwartung !== null && r.vorwert !== null
    && ((Date.parse(r.event_time) > jetzt && Date.parse(r.event_time) <= jetzt + 14 * 86_400_000)
      || (Date.parse(r.event_time) <= jetzt && r.ist === null && Date.parse(r.event_time) >= jetzt - 45 * 86_400_000)))
    .sort((a, b) => a.event_time.localeCompare(b.event_time));
  const r = kandidaten[kandidaten.length - 1];
  if (!r || r.erwartung === null || r.vorwert === null) return null;
  const kommt = Date.parse(r.event_time) > jetzt;
  const zusatz = `${kommt ? "erwartet" : "erwartet, Ist offen"} (${tag(r.event_time)})`;
  if (r.erwartung > r.vorwert) return `Erhöhung auf ${fmtWert(r.erwartung, r.einheit)} ${zusatz}`;
  if (r.erwartung < r.vorwert) return `Senkung auf ${fmtWert(r.erwartung, r.einheit)} ${zusatz}`;
  return `Halten bei ${fmtWert(r.erwartung, r.einheit)} ${zusatz}`;
}

/* ---------------------------------------------------------- Kernzahlen */

interface KernDef {
  key: string;
  label: string;
  ebene: 1 | 2;
  muster: RegExp[];
  /** Teil aus bewertung.ts als Ersatz, wenn der Kalender nichts hat. */
  teil?: string;
  pmi?: boolean;
}

/**
 * Die Kernzahlen — je Bereich eine, höchstens zwei. Die Reihenfolge der
 * Muster ist die Vorliebe: für USD der ISM vor dem S&P-PMI, für EUR die
 * Eurozone vor Deutschland, beim Kern die Zahl, auf die die Notenbank schaut.
 */
const KERN: KernDef[] = [
  {
    key: "pmi_industrie", label: "PMI Industrie", ebene: 1, pmi: true, teil: "pmi_industrie",
    muster: [/^ISM Manufacturing PMI$/i, /^Manufacturing PMI$/i, /^procure\.ch Manufacturing PMI$/i,
      /^Business ?NZ (Manufacturing Index|PMI)$/i, /^German Manufacturing PMI$/i, /Manufacturing PMI$/i,
      /PMI der Hersteller/i, /PMI\) verarbeitendes Gewerbe/i, /^BusinessNZ Herstellerindex$/i],
  },
  {
    key: "pmi_dienste", label: "PMI Dienste", ebene: 1, pmi: true, teil: "pmi_dienste",
    muster: [/^ISM Services PMI$/i, /^Services PMI$/i, /^Ivey PMI$/i, /^Business ?NZ Services Index$/i,
      /^German Services PMI$/i, /Services PMI$/i, /PMI der Dienstleister/i, /PMI\) Dienstleistungen/i,
      /^BusinessNZ Dienstleistungsindex$/i],
  },
  {
    key: "bip", label: "BIP", ebene: 1, teil: "bip_yoy",
    muster: [/^GDP q\/q$/i, /^GDP m\/m$/i, /^GDP y\/y$/i, /GDP q\/q$/i],
  },
  {
    key: "arbeitslos", label: "Arbeitslosenquote", ebene: 1, teil: "arbeitslos",
    muster: [/^Unemployment Rate$/i],
  },
  {
    key: "jobs", label: "Jobs", ebene: 1,
    muster: [/^Non-Farm Employment Change$/i, /^Employment Change$/i, /^Employment Change q\/q$/i,
      /^Claimant Count Change$/i, /^Unemployment Change$/i],
  },
  {
    key: "cpi", label: "Inflation", ebene: 2,
    muster: [/^CPI y\/y$/i, /^CPI (Flash )?Estimate y\/y$/i, /^National CPI y\/y$/i, /^Tokyo CPI y\/y$/i,
      /^CPI q\/q$/i, /^CPI m\/m$/i, /^German CPI m\/m$/i],
  },
  {
    key: "kern_cpi", label: "Kerninflation", ebene: 2,
    muster: [/^Core CPI (Flash )?Estimate y\/y$/i, /^Core CPI m\/m$/i, /^Core CPI y\/y$/i, /^Trimmed Mean CPI (m\/m|q\/q)$/i,
      /^Trimmed CPI y\/y$/i, /^National Core CPI y\/y$/i, /^Tokyo Core CPI y\/y$/i, /^Core PCE Price Index m\/m$/i],
  },
];

/**
 * Die Reihe zu einer Kernzahl. Die Muster sind nach Vorliebe geordnet, aber
 * eine bevorzugte Reihe, die seit Monaten kein Ist mehr hat (am 29.09.2026:
 * der Eurozonen-PMI, letztes Ist im Juni, während der deutsche PMI jede Woche
 * kam), verliert gegen eine spätere, die mehr als 45 Tage frischer ist.
 */
function reiheFuer(def: KernDef, releases: Release[], jetzt: number): Release[] {
  const vergangen = releases.filter((r) => Date.parse(r.event_time) <= jetzt);
  const kandidaten: { serie: string; zuletzt: number }[] = [];
  for (const m of def.muster) {
    const treffer = vergangen.filter((r) => m.test(r.serie) && r.ist !== null);
    const jeSerie = new Map<string, number>();
    for (const r of treffer) jeSerie.set(r.serie, Math.max(jeSerie.get(r.serie) ?? 0, Date.parse(r.event_time)));
    // Innerhalb eines Musters die frischeste Reihe zuerst.
    for (const [serie, zuletzt] of [...jeSerie.entries()].sort((a, b) => b[1] - a[1])) {
      if (!kandidaten.some((k) => k.serie === serie)) kandidaten.push({ serie, zuletzt });
    }
  }
  if (kandidaten.length === 0) return [];
  const frischeste = Math.max(...kandidaten.map((k) => k.zuletzt));
  const wahl = kandidaten.find((k) => k.zuletzt >= frischeste - 45 * 86_400_000)!;
  return vergangen.filter((r) => r.serie === wahl.serie).sort((a, b) => a.event_time.localeCompare(b.event_time));
}

/** „Expansion, schwächer" — Niveau UND Richtung in Worten. */
function pmiNiveau(wert: number, trend: "↑" | "↓" | "→" | null): string {
  const lage = wert >= 50 ? "Expansion" : "Kontraktion";
  if (trend === "↑") return `${lage}, ${wert >= 50 ? "stärker" : "weniger stark"}`;
  if (trend === "↓") return `${lage}, ${wert >= 50 ? "schwächer" : "stärker"}`;
  return lage;
}

/** Steigend = grün, fallend = rot; bei gleichem Wert entscheidet die Überraschung. */
function pmiTon(trend: "↑" | "↓" | "→" | null, zTon: Ton): Ton {
  if (trend === "↑") return zTon === "schlecht" ? "neutral" : "gut";
  if (trend === "↓") return zTon === "gut" ? "neutral" : "schlecht";
  return zTon === "fehlt" ? "neutral" : zTon;
}

function kernzahl(def: KernDef, releases: Release[], teile: Teil[], jetzt: number): Kernzahl {
  const reihe = reiheFuer(def, releases, jetzt);
  const mitIst = reihe.filter((r) => r.ist !== null);
  const letzter = mitIst[mitIst.length - 1] ?? null;

  const teilErsatz = def.teil ? teile.find((x) => x.key === def.teil) : undefined;
  const veraltet = letzter !== null && Date.parse(letzter.event_time) < jetzt - 120 * 86_400_000
    && teilErsatz !== undefined && teilErsatz.wert !== null && teilErsatz.status !== "veraltet";
  if (letzter && letzter.ist !== null && !veraltet) {
    const ist = letzter.ist;
    const trendBasis = letzter.vorwert;
    const trend = trendBasis === null ? null
      : ist > trendBasis + 1e-9 ? "↑" : ist < trendBasis - 1e-9 ? "↓" : "→";
    const vergleich = letzter.erwartung === null ? "ohne Erwartung"
      : Math.abs(ist - letzter.erwartung) < 1e-9 ? "wie erwartet"
        : `${abweichungWort(letzter.z)} ${ist > letzter.erwartung ? "höher" : "tiefer"} als erwartet`;
    const niveau = def.pmi ? pmiNiveau(ist, trend) : null;
    // Ton: beim PMI zählt die RICHTUNG (02.10.2026, Kerim: 55 → 54 ist
    // „über 50", aber die Wirtschaft verliert Schwung), danach die
    // Überraschung. Sonst allein die Abweichung von der Erwartung.
    const zTon = letzter.z === null ? "neutral" as Ton : tonAus(letzter.z, 0.3);
    const ton: Ton = def.pmi ? pmiTon(trend, zTon) : zTon;
    return {
      key: def.key, label: def.label, ebene: def.ebene,
      wert: fmtWert(ist, letzter.einheit), datum: tag(letzter.event_time),
      vergleich, ton, niveau, trend,
      details: [
        `${letzter.titel} · ${tag(letzter.event_time)}`,
        `Ist ${fmtWert(ist, letzter.einheit)} · Erwartung ${fmtWert(letzter.erwartung, letzter.einheit)} · Vorwert ${fmtWert(letzter.vorwert, letzter.einheit)}`,
        ...mitIst.slice(-4, -1).reverse().map((r) =>
          `${tag(r.event_time)}: ${fmtWert(r.ist, r.einheit)} (erwartet ${fmtWert(r.erwartung, r.einheit)})`),
      ],
      fehlt: null,
    };
  }

  // Ersatz aus den Niveau-Reihen (OECD, Eurostat, FRED, von Hand).
  const t = teilErsatz;
  if (t && t.wert !== null && t.status !== "veraltet") {
    const trend = t.delta === null || t.delta === undefined ? null : t.delta > 0 ? "↑" : t.delta < 0 ? "↓" : "→";
    return {
      key: def.key, label: def.label, ebene: def.ebene,
      wert: `${t.wert.toFixed(1)}${t.einheit === "%" ? " %" : ""}`, datum: t.stand ?? null,
      vergleich: "ohne Erwartung", ton: def.pmi ? pmiTon(trend, "neutral") : tonAus(t.score),
      niveau: def.pmi ? pmiNiveau(t.wert, trend) : null,
      trend, details: [t.text, t.quelle ? `Quelle: ${t.quelle}` : ""].filter(Boolean), fehlt: null,
    };
  }
  return {
    key: def.key, label: def.label, ebene: def.ebene, wert: "", datum: null, vergleich: "",
    ton: "fehlt", niveau: null, trend: null, details: [],
    fehlt: t?.status === "veraltet" ? "nur veraltete Werte" : "keine freie Quelle",
  };
}

function leitzinsKern(releases: Release[], teile2: Teil[], schritt: string | null, jetzt: number): Kernzahl {
  const entscheide = releases
    .filter((r) => r.kategorie === "notenbank" && r.ist !== null && Date.parse(r.event_time) <= jetzt)
    .sort((a, b) => a.event_time.localeCompare(b.event_time));
  const letzter = entscheide[entscheide.length - 1] ?? null;
  const zyklus = teile2.find((t) => t.key === "zyklus");
  const zyklusText = zyklus && zyklus.score !== null
    ? zyklus.text.split(" — ")[0].replace(" (aus dem Zinsverlauf)", "") : null;
  if (letzter && letzter.ist !== null) {
    const u = entscheidUrteil(letzter);
    return {
      key: "leitzins", label: "Leitzins", ebene: 2,
      wert: fmtWert(letzter.ist, letzter.einheit), datum: tag(letzter.event_time),
      vergleich: u.text, ton: tonAus(zyklus?.score ?? null),
      niveau: zyklusText, trend: letzter.vorwert === null ? null
        : letzter.ist > letzter.vorwert ? "↑" : letzter.ist < letzter.vorwert ? "↓" : "→",
      details: [
        `${letzter.titel} · ${tag(letzter.event_time)}: ${fmtWert(letzter.ist, letzter.einheit)} (erwartet ${fmtWert(letzter.erwartung, letzter.einheit)}, vorher ${fmtWert(letzter.vorwert, letzter.einheit)})`,
        ...(zyklus ? [zyklus.text] : []),
        ...(schritt ? [`Nächster Schritt: ${schritt}`] : []),
      ],
      fehlt: null,
    };
  }
  const niveau = teile2.find((t) => t.key === "zinsniveau");
  if (niveau && niveau.wert !== null) {
    return {
      key: "leitzins", label: "Leitzins", ebene: 2, wert: `${niveau.wert.toFixed(2)} %`, datum: null,
      vergleich: "", ton: tonAus(zyklus?.score ?? null), niveau: zyklusText, trend: null,
      details: [niveau.text, ...(zyklus ? [zyklus.text] : []), ...(schritt ? [`Nächster Schritt: ${schritt}`] : [])],
      fehlt: null,
    };
  }
  return {
    key: "leitzins", label: "Leitzins", ebene: 2, wert: "", datum: null, vergleich: "", ton: "fehlt",
    niveau: null, trend: null, details: [], fehlt: "kein Leitzins in der Datenbank",
  };
}

/* --------------------------------------------------------- Gründe */

const KAT_SATZ: Partial<Record<Kategorie, { plus: string; minus: string; name: string }>> = {
  inflation: { name: "Inflation", plus: "über Erwartung — Druck auf die Notenbank, stützt", minus: "unter Erwartung — Spielraum für Senkungen, belastet" },
  wachstum: { name: "Wachstumsdaten", plus: "besser als erwartet — stützt", minus: "schlechter als erwartet — belastet" },
  arbeit: { name: "Arbeitsmarktdaten", plus: "besser als erwartet — stützt", minus: "schlechter als erwartet — belastet" },
};

function serienGruende(releases: Release[], jetzt: number): Grund[] {
  const out: Grund[] = [];
  const ab = jetzt - 90 * 86_400_000;
  for (const [k, satz] of Object.entries(KAT_SATZ) as [Kategorie, NonNullable<(typeof KAT_SATZ)[Kategorie]>][]) {
    const liste = releases.filter((r) => r.kategorie === k && wichtig(r) && r.z !== null
      && Date.parse(r.event_time) >= ab && Date.parse(r.event_time) <= jetzt);
    const plus = liste.filter((r) => r.z! >= 0.3).length;
    const minus = liste.filter((r) => r.z! <= -0.3).length;
    if (plus >= 3 && plus >= 2 * Math.max(1, minus)) {
      out.push({ ton: "gut", gewicht: 0.3 + 0.05 * plus, text: `${satz.name} ${plus}× ${satz.plus} (${minus}× umgekehrt, 90 Tage).` });
    } else if (minus >= 3 && minus >= 2 * Math.max(1, plus)) {
      out.push({ ton: "schlecht", gewicht: 0.3 + 0.05 * minus, text: `${satz.name} ${minus}× ${satz.minus} (${plus}× umgekehrt, 90 Tage).` });
    }
  }
  return out;
}

function nachrichtSatz(r: Release): string {
  const richtung = (r.z ?? 0) > 0 ? "stützt" : "belastet";
  return `${r.titel}: ${fmtWert(r.ist, r.einheit)} statt ${fmtWert(r.erwartung, r.einheit)} erwartet (${tag(r.event_time)}) — ${richtung} ${r.ccy}.`;
}

/* ---------------------------------------------------------- Urteil */

export function urteilFuer(zeile: WaehrungsBild | null, releases: Release[], jetzt = Date.now()): UrteilBild {
  const ccy = zeile?.ccy ?? releases[0]?.ccy ?? "";
  const eigene = releases.filter((r) => r.ccy === ccy);
  const e1 = zeile?.ebenen.find((e) => e.ebene === 1);
  const e2 = zeile?.ebenen.find((e) => e.ebene === 2);
  const teile1 = e1?.teile ?? [];
  const teile2 = e2?.teile ?? [];

  const idx = indexBis(eigene, new Date(jetzt)).wert;
  const ue = idx === null ? null : klemme(idx / 1.5);
  const zb = e2?.score ?? null;
  const wi = e1?.score ?? null;

  const anteile: [number | null, number][] = [
    [zb, URTEIL_GEWICHT.zentralbank], [wi, URTEIL_GEWICHT.wirtschaft], [ue, URTEIL_GEWICHT.ueberraschung],
  ];
  const da = anteile.filter(([x, g]) => x !== null && g > 0) as [number, number][];
  const gewicht = da.reduce((s, [, g]) => s + g, 0);
  const score = da.length === 0 || gewicht === 0 ? null
    : Math.round((da.reduce((s, [x, g]) => s + x * g, 0) / gewicht) * 1000) / 1000;
  const wort = urteilWort(score);

  const schritt = erwarteterSchritt(eigene, jetzt);
  const kern = [...KERN.map((d) => kernzahl(d, eigene, teile1, jetzt)), leitzinsKern(eigene, teile2, schritt, jetzt)];
  const k = (key: string) => kern.find((x) => x.key === key)!;

  /* Grosse Abweichungen */
  const grosse = eigene
    .filter((r) => wichtig(r) && r.z !== null && Math.abs(r.z) >= 1.5
      && Date.parse(r.event_time) <= jetzt && Date.parse(r.event_time) >= jetzt - 30 * 86_400_000)
    .sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!))
    .slice(0, 6);
  const nachricht = grosse.find((r) => Date.parse(r.event_time) >= jetzt - 14 * 86_400_000) ?? null;

  /* Felder für die Übersicht */
  const zyklus = teile2.find((t) => t.key === "zyklus");
  const zyklusKurz = zyklus && zyklus.score !== null
    ? zyklus.text.split(" — ")[0].replace(" (aus dem Zinsverlauf)", "") : "Zyklus unbekannt";
  const pmi = k("pmi_industrie");
  const felder: UrteilBild["felder"] = {
    wirtschaft: {
      // Farbe nach der PMI-Richtung, nicht nach „über 50" (02.10.2026).
      ton: pmi.wert ? pmi.ton : tonAus(wi),
      kurz: pmi.wert ? `PMI ${pmi.wert}${pmi.trend && pmi.trend !== "→" ? ` ${pmi.trend}` : ""}` : "PMI fehlt",
      lang: [pmi.wert ? `PMI Industrie ${pmi.wert} (${pmi.niveau ?? ""}${pmi.trend ? `, ${pmi.trend === "↑" ? "steigend" : pmi.trend === "↓" ? "fallend" : "gleich"}` : ""})` : "PMI Industrie fehlt",
        k("pmi_dienste").wert ? `PMI Dienste ${k("pmi_dienste").wert}` : null,
        k("bip").wert ? `BIP ${k("bip").wert}` : null].filter(Boolean).join(" · "),
    },
    zentralbank: {
      ton: tonAus(zb),
      kurz: `${BANK[ccy] ?? ""} ${zyklusKurz}`.trim(),
      // Die Farbe ist das GESAMTE Zentralbank-Bild, nicht nur der Zyklus —
      // „Pause unten" kann grün sein, wenn Realzins oder Markterwartung
      // stützen. Darum hier die Teile einzeln (02.10.2026).
      lang: [
        zyklus?.text,
        schritt ? `Nächster Schritt: ${schritt}` : null,
        `Farbe = Gesamtbild Zentralbank: ${teile2.filter((t) => t.score !== null && !t.kontext)
          .map((t) => `${t.label} ${t.score! >= 0.15 ? "▲" : t.score! <= -0.15 ? "▼" : "●"}`).join(" · ")}.`,
        "Nur Anzeige — zählt seit 03.10.2026 nicht ins Urteil.",
      ].filter(Boolean).join(" "),
    },
    ueberraschung: {
      ton: tonAus(ue),
      kurz: ue === null ? "keine Daten" : ue >= 0.2 ? "besser als erwartet" : ue <= -0.2 ? "schlechter als erwartet" : "im Rahmen",
      lang: ue === null ? "Keine Veröffentlichung mit Erwartung und Ist."
        : "Gewichteter Schnitt der Abweichungen von der Erwartung (Wachstum, Inflation, Arbeitsmarkt), jüngere und wichtige Termine zählen mehr. Nur Anzeige — zählt seit 03.10.2026 nicht ins Urteil.",
    },
  };

  /* Gründe */
  const gruende: Grund[] = [];
  if (zyklus && zyklus.score !== null) {
    gruende.push({
      ton: tonAus(zyklus.score), gewicht: 0.7,
      text: `${BANK[ccy] ?? "Notenbank"}: ${zyklusKurz}${schritt ? ` — ${schritt}` : ""} (nur Anzeige).`,
    });
  } else if (schritt) {
    gruende.push({ ton: "neutral", gewicht: 0.65, text: `${BANK[ccy] ?? "Notenbank"}: ${schritt} (nur Anzeige).` });
  }
  const markt = teile2.find((t) => t.key === "erwartung");
  if (markt && markt.score !== null && Math.abs(markt.score) >= 0.4) {
    gruende.push({ ton: tonAus(markt.score), gewicht: 0.5 + 0.1 * Math.abs(markt.score), text: `Markt: ${markt.text} (nur Anzeige)` });
  }
  const pmiD = k("pmi_dienste");
  if (pmi.wert || pmiD.wert) {
    const teileText = [
      pmi.wert ? `PMI Industrie ${pmi.wert} (${pmi.niveau}${pmi.trend === "↑" ? ", steigend" : pmi.trend === "↓" ? ", fallend" : ""})` : null,
      pmiD.wert ? `Dienste ${pmiD.wert} (${pmiD.niveau}${pmiD.trend === "↑" ? ", steigend" : pmiD.trend === "↓" ? ", fallend" : ""})` : null,
    ].filter(Boolean).join(" · ");
    gruende.push({ ton: tonAus(wi), gewicht: 1, text: `${teileText}.` });
  }
  if (nachricht) {
    gruende.push({ ton: (nachricht.z ?? 0) > 0 ? "gut" : "schlecht", gewicht: 0.8, text: nachrichtSatz(nachricht) });
  }
  gruende.push(...serienGruende(eigene, jetzt));
  const inflation = k("kern_cpi").wert ? k("kern_cpi") : k("cpi");
  if (inflation.wert && inflation.vergleich && inflation.vergleich !== "wie erwartet" && inflation.vergleich !== "ohne Erwartung"
    && !gruende.some((g) => g.text.startsWith("Inflation"))) {
    gruende.push({ ton: inflation.ton, gewicht: 0.5, text: `${inflation.label} ${inflation.wert}, ${inflation.vergleich} (${inflation.datum}).` });
  }
  const arbeitslos = k("arbeitslos");
  if (arbeitslos.wert && arbeitslos.trend && arbeitslos.trend !== "→") {
    gruende.push({
      ton: arbeitslos.trend === "↑" ? "schlecht" : "gut", gewicht: 0.4,
      text: `Arbeitslosenquote ${arbeitslos.wert}, ${arbeitslos.trend === "↑" ? "steigend — belastet" : "fallend — stützt"}.`,
    });
  }
  // Seit 03.10.2026 zählt nur die Wirtschaft: die Gründe stehen nach Gewicht,
  // damit oben steht, was das Urteil trägt (PMI), und nicht die Notenbank.
  const oben = [...gruende].sort((a, b) => b.gewicht - a.gewicht).slice(0, 5);

  return {
    ccy, score, wort, ton: tonAus(score, 0.12),
    teile: { zentralbank: zb, wirtschaft: wi, ueberraschung: ue },
    felder,
    gruende: oben,
    kern, nachricht, grosse, schritt,
  };
}

/* ------------------------------------------------------ Paar-Klasse */

/**
 * Wie gut ein Paar zur Regel „stark gegen schwach" passt (29.09.2026):
 *   A  stark gegen schwach — beide Seiten ziehen in dieselbe Richtung.
 *   B  stark gegen neutral (oder neutral gegen schwach) — nur eine Seite
 *      zieht. Kerim: „meist keine so gute Idee" — wird nur mit Vorsicht
 *      gezeigt, und die Wochenideen messen, ob B überhaupt trägt.
 * Beide brauchen mindestens 0.40 Abstand; darunter ist es keine Idee.
 */
export type PaarKlasse = "A" | "B";
export const PAAR_ABSTAND = 0.4;
const NEUTRAL_BIS = 0.12;

export function paarKlasse(scoreStark: number | null, scoreSchwach: number | null): PaarKlasse | null {
  if (scoreStark === null || scoreSchwach === null) return null;
  if (scoreStark - scoreSchwach < PAAR_ABSTAND) return null;
  return scoreStark >= NEUTRAL_BIS && scoreSchwach <= -NEUTRAL_BIS ? "A" : "B";
}

/** Die Kurzform eines Urteils für Schnappschüsse (Journal, Wochenideen). */
export interface UrteilKurz {
  ccy: string;
  wort: UrteilWort;
  score: number | null;
  gruende: string[];
}

export function kurzform(u: UrteilBild): UrteilKurz {
  return { ccy: u.ccy, wort: u.wort, score: u.score, gruende: u.gruende.slice(0, 3).map((g) => g.text) };
}

/** Der jüngste Wert einer Kernzahl mit Ist bis `jetzt` — für die Rückrechnung. */
export function kernWert(key: string, releases: Release[], jetzt: number): Release | null {
  const def = KERN.find((k) => k.key === key);
  if (!def) return null;
  const reihe = reiheFuer(def, releases, jetzt).filter((r) => r.ist !== null);
  return reihe[reihe.length - 1] ?? null;
}

/** Das Urteil aus den drei Teilen — dieselbe Rechnung wie in urteilFuer. Teile mit Gewicht 0 zählen nicht. */
export function gesamtScore(
  zb: number | null, wi: number | null, ue: number | null, w: Gewichte = URTEIL_GEWICHT,
): number | null {
  const da = ([[zb, w.zentralbank], [wi, w.wirtschaft], [ue, w.ueberraschung]] as [number | null, number][])
    .filter(([x, g]) => x !== null && g > 0) as [number, number][];
  if (da.length === 0) return null;
  const g = da.reduce((s, [, w]) => s + w, 0);
  return Math.round((da.reduce((s, [x, w]) => s + x * w, 0) / g) * 1000) / 1000;
}
