// Kontrollwerte für die Confluence-Auswertung.
// Aufruf:  npx -y tsx tools/checks/confluence.mts
//
// Kein Netz, keine Datenbank. Der Punkt dieser Datei ist die As-of-Regel:
// dass kein Wert benutzt wird, bevor er veröffentlicht war. Ohne diese
// Prüfung merkt man den Fehler nie — eine rückblickende Auswertung mit
// Lookahead sieht einfach nur überzeugend aus.
import {
  wertZum, aenderung, schnitt, perzentil, tageZwischen, plusTage,
  frischeVon, montagVon, VERZUG, type Punkt,
} from "../../src/lib/confluence/reihen";
import {
  werteFuer, baueRegime, verhaeltnisReihe, faktorZins, faktorReal,
  faktorErwartung, faktorRegime, baueVeto, bewertePaar, waehrungsBild, bewerteAlle,
  ampelFuer, baueMatrix, handelbare,
  RISIKO_BETA, SCHWELLE, VETO_GRENZE, LEERE_DATEN, PAARE, AMPEL_SCHWELLE, G8,
  type Rohdaten, type RegimeLage,
} from "../../src/lib/confluence/faktoren";
import {
  wilson, gruppiere, vergleiche, vetoBilanz, aufteilung, lagerVon, MIN_JE_SEITE,
  type TradeUrteil,
} from "../../src/lib/confluence/bilanz";
import { nettoReihe } from "../../src/lib/confluence/rechnen";
import {
  ergebnisKreuz, faktorBilanz, auffaellige, type TiefenTrade,
} from "../../src/lib/confluence/tiefe";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

/** Reihe aus [datum, wert]-Paaren. */
const r = (...p: [string, number][]): Punkt[] => p.map(([datum, wert]) => ({ datum, wert }));

/** Tägliche Reihe ab `start`, `n` Werte, Wert von `f(i)`. */
function taeglich(start: string, n: number, f: (i: number) => number): Punkt[] {
  return Array.from({ length: n }, (_, i) => ({ datum: plusTage(start, i), wert: f(i) }));
}

/* ------------------------------------------------------------- Datums-Mathe */
check("tageZwischen", tageZwischen("2026-03-01", "2026-03-15"), 14);
check("tageZwischen ueber Monatsgrenze", tageZwischen("2026-02-25", "2026-03-02"), 5);
check("tageZwischen rueckwaerts", tageZwischen("2026-03-15", "2026-03-01"), -14);
check("plusTage", plusTage("2026-12-30", 3), "2027-01-02");
check("plusTage negativ", plusTage("2026-01-02", -3), "2025-12-30");
check("montagVon Mittwoch", montagVon("2026-08-12"), "2026-08-10");
check("montagVon Montag bleibt", montagVon("2026-08-10"), "2026-08-10");
check("montagVon Sonntag geht zurueck", montagVon("2026-08-16"), "2026-08-10");

/* ------------------------------------------------------------- wertZum */
const monat = r(["2026-01-01", 1], ["2026-02-01", 2], ["2026-03-01", 3]);

check("ohne Verzug: juengster Wert", wertZum(monat, "2026-03-20")?.wert, 3);
// Der Kern der ganzen Datei: der Maerz-Wert ist am 20.03. noch nicht draussen.
check("mit 45 Tagen Verzug ist der Maerz-Wert noch nicht bekannt",
  wertZum(monat, "2026-03-20", VERZUG.monatlich)?.wert, 2);
check("nach dem Verzug ist er bekannt",
  wertZum(monat, "2026-04-16", VERZUG.monatlich)?.wert, 3);
check("Verzug: genau am Erscheinungstag zaehlt er",
  wertZum(monat, "2026-04-15", VERZUG.monatlich)?.wert, 3);
check("vor dem ersten Wert: nichts", wertZum(monat, "2025-12-31"), null);
check("leere Reihe", wertZum([], "2026-03-01"), null);
check("Alter wird mitgeliefert", wertZum(monat, "2026-03-11")?.alterTage, 10);
// Mit Verzug ist der Februar-Wert am 11.03. noch nicht draussen (01.02. + 45 =
// 18.03.), also gilt der Januar-Wert - und der ist dann 69 Tage alt.
check("mit Verzug ist der benutzbare Wert deutlich aelter",
  wertZum(monat, "2026-03-11", VERZUG.monatlich)?.alterTage, 69);

/* ------------------------------------------------------------- aenderung */
const zins = r(["2025-09-01", 2.0], ["2025-12-01", 2.5], ["2026-03-01", 3.0]);
// Am 01.05. ist der Maerz-Wert bekannt (3.0), vor 182 Tagen (31.10.) war es
// der September-Wert (2.0) - der Dezember-Wert erschien erst am 15.01.
check("Aenderung ueber 6 Monate, beide Seiten mit Verzug",
  aenderung(zins, "2026-05-01", 182, VERZUG.monatlich)?.toFixed(2), "1.00");
check("Aenderung null, wenn beide Seiten derselbe Punkt sind",
  aenderung(zins, "2026-06-01", 10, VERZUG.monatlich), null);
check("Aenderung null ohne Vergleichswert",
  aenderung(zins, "2025-11-01", 182, VERZUG.monatlich), null);

/* ------------------------------------------------------------- schnitt */
const gerade = taeglich("2026-01-01", 60, (i) => i);
check("50-Tage-Schnitt", schnitt(gerade, "2026-03-01", 50, 0), 34.5);
check("Schnitt null bei zu wenig Werten", schnitt(gerade, "2026-01-10", 50, 0), null);

/* ------------------------------------------------------------- perzentil */
const steigend = taeglich("2024-01-01", 400, (i) => i);
const p = perzentil(steigend, "2025-02-03", 1095, 0, 26);
check("hoechster Wert liegt fast ganz oben", p && p.rang > 99, true);
check("Perzentil kennt seine Stichprobe", p?.n, 400);

const flach = taeglich("2024-01-01", 200, () => 5);
check("lauter gleiche Werte ergeben die Mitte",
  perzentil(flach, "2024-07-01", 1095, 0, 26)?.rang, 50);
check("zu wenig Historie ergibt kein Perzentil",
  perzentil(taeglich("2026-01-01", 10, (i) => i), "2026-01-11", 1095, 0, 26), null);

// Fenster: nur Werte AUS dem Fenster zaehlen, nicht die ganze Historie.
const langLauf = taeglich("2020-01-01", 2000, (i) => i);
const eng = perzentil(langLauf, "2025-06-01", 365, 0, 26);
check("Fenster begrenzt die Vergleichsbasis", eng !== null && eng.n <= 366, true);

/* ------------------------------------------------------------- Frische */
check("taegliche Serie, 2 Tage alt", frischeVon(2, "taeglich"), "frisch");
check("taegliche Serie, 20 Tage alt", frischeVon(20, "taeglich"), "alt");
check("Monatsserie, 40 Tage alt ist normal", frischeVon(40, "monatlich"), "frisch");
check("Quartalsserie, 80 Tage alt ist normal", frischeVon(80, "quartalsweise"), "frisch");
check("fehlender Wert", frischeVon(null, "taeglich"), "fehlt");

/* ------------------------------------------------------------- verhaeltnis */
check("Verhaeltnis nur an gemeinsamen Daten",
  verhaeltnisReihe(r(["2026-01-01", 10], ["2026-01-02", 20]), r(["2026-01-02", 4])),
  [{ datum: "2026-01-02", wert: 5 }]);
check("Division durch null wird uebersprungen",
  verhaeltnisReihe(r(["2026-01-01", 10]), r(["2026-01-01", 0])), []);

/* ------------------------------------------------------------- Regime */
const STICHTAG = "2026-08-14";

function marktDaten(vix: number, spxAb: number, kupferAb: number): Rohdaten {
  // 80 flache Tage, dann der Schlusswert - so ist der 50-Tage-Schnitt bekannt.
  const mitEnde = (basis: number, ende: number) =>
    taeglich("2026-05-01", 106, (i) => (i < 105 ? basis : ende));
  return {
    ...LEERE_DATEN,
    vix: taeglich("2026-05-01", 106, () => vix),
    spx: mitEnde(100, 100 * (1 + spxAb)),
    gold: taeglich("2026-05-01", 106, () => 2000),
    kupfer: mitEnde(10, 10 * (1 + kupferAb)),
  };
}

const risikoAn = baueRegime(marktDaten(12, 0.05, 0.10), STICHTAG);
check("ruhiger VIX + starke Aktien + starkes Kupfer = risk-on", risikoAn.lage, "risk-on");
check("drei Bausteine erkannt", risikoAn.teile.length, 3);

const risikoAus = baueRegime(marktDaten(32, -0.06, -0.12), STICHTAG);
check("hoher VIX + schwache Aktien + schwaches Kupfer = risk-off", risikoAus.lage, "risk-off");

check("mittlere Werte ergeben neutral", baueRegime(marktDaten(18, 0.0, 0.0), STICHTAG).lage, "neutral");
check("ohne Marktdaten kein Regime", baueRegime(LEERE_DATEN, STICHTAG).lage, "unbekannt");
check("fehlende Quellen werden benannt",
  baueRegime(LEERE_DATEN, STICHTAG).fehlend, ["VIX", "S&P 500", "Kupfer/Gold"]);
check("Regime ohne Daten hat keinen Score", baueRegime(LEERE_DATEN, STICHTAG).score, null);

const KEIN_REGIME: RegimeLage = {
  score: null, lage: "unbekannt", teile: [], fehlend: ["Test"], datum: null, frische: "fehlt",
};
const NEUTRAL: RegimeLage = {
  score: 0, lage: "neutral", teile: [], fehlend: [], datum: STICHTAG, frische: "frisch",
};
const RISK_OFF: RegimeLage = {
  score: -0.8, lage: "risk-off", teile: [], fehlend: [], datum: STICHTAG, frische: "frisch",
};

/* ------------------------------------------------------------- Zinsfaktor */
function daten(vorgabe: {
  leitzins?: Record<string, [string, number][]>;
  cpi?: Record<string, [string, number][]>;
  cot?: Record<string, [string, number][]>;
  cotBanken?: Record<string, [string, number][]>;
  cotRealMoney?: Record<string, [string, number][]>;
  zwei?: Record<string, [string, number][]>;
}): Rohdaten {
  const um = (o: Record<string, [string, number][]> = {}) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(...v)]));
  return {
    ...LEERE_DATEN,
    leitzins: um(vorgabe.leitzins), cpi: um(vorgabe.cpi),
    cot: um(vorgabe.cot), zwei: um(vorgabe.zwei),
    cotBanken: um(vorgabe.cotBanken), cotRealMoney: um(vorgabe.cotRealMoney),
  };
}

const w = (d: Rohdaten, ccy: string) => werteFuer(d, ccy, STICHTAG);

const hochTief = daten({
  leitzins: { EUR: [["2026-01-01", 4.0]], USD: [["2026-01-01", 1.0]] },
});
check("klare Zinsdifferenz zeigt nach oben",
  faktorZins(w(hochTief, "EUR"), w(hochTief, "USD")).dir, 1);
check("umgekehrt nach unten",
  faktorZins(w(hochTief, "USD"), w(hochTief, "EUR")).dir, -1);

const knapp = daten({
  leitzins: { EUR: [["2026-01-01", 2.1]], USD: [["2026-01-01", 2.0]] },
});
check("0.10 pp ist unter der Schwelle",
  faktorZins(w(knapp, "EUR"), w(knapp, "USD")).dir, 0);

check("fehlender Leitzins ergibt keine Aussage",
  faktorZins(w(daten({}), "EUR"), w(daten({}), "USD")).dir, 0);
check("und benennt, was fehlt",
  faktorZins(w(daten({}), "EUR"), w(daten({}), "USD")).luecke, "Leitzins fehlt für EUR");

// Die 6-Monats-Regel: eine Differenz, die schneller schrumpft als sie traegt.
const schrumpft = daten({
  leitzins: {
    EUR: [["2025-06-01", 4.5], ["2026-01-01", 3.0]],
    USD: [["2025-06-01", 2.0], ["2026-01-01", 2.0]],
  },
});
check("schrumpfende Differenz hebt die Richtung auf",
  faktorZins(w(schrumpft, "EUR"), w(schrumpft, "USD")).dir, 0);

const waechst = daten({
  leitzins: {
    EUR: [["2025-06-01", 2.5], ["2026-01-01", 4.0]],
    USD: [["2025-06-01", 2.0], ["2026-01-01", 2.0]],
  },
});
check("wachsende Differenz behaelt die Richtung",
  faktorZins(w(waechst, "EUR"), w(waechst, "USD")).dir, 1);

/* ------------------------------------------------------------- Realzins */
// Nominal spricht fuer EUR, real dagegen: genau der Fall, fuer den es den
// zweiten Faktor gibt.
const realDreht = daten({
  leitzins: { EUR: [["2026-01-01", 5.0]], USD: [["2026-01-01", 4.0]] },
  cpi: { EUR: [["2026-01-01", 6.0]], USD: [["2026-01-01", 2.0]] },
});
check("nominal spricht fuer EUR", faktorZins(w(realDreht, "EUR"), w(realDreht, "USD")).dir, 1);
check("real spricht dagegen", faktorReal(w(realDreht, "EUR"), w(realDreht, "USD")).dir, -1);
check("fehlende Inflation ergibt keine Aussage",
  faktorReal(w(hochTief, "EUR"), w(hochTief, "USD")).dir, 0);

/* ------------------------------------------------------------- Regimefaktor */
const leer = daten({});
check("Risk-off spricht fuer den Yen gegen den Aussie",
  faktorRegime(w(leer, "JPY"), w(leer, "AUD"), RISK_OFF).dir, 1);
check("und gegen AUDJPY long",
  faktorRegime(w(leer, "AUD"), w(leer, "JPY"), RISK_OFF).dir, -1);
check("neutrales Regime sagt nichts",
  faktorRegime(w(leer, "JPY"), w(leer, "AUD"), NEUTRAL).dir, 0);
check("unbekanntes Regime sagt nichts",
  faktorRegime(w(leer, "JPY"), w(leer, "AUD"), KEIN_REGIME).dir, 0);
check("zwei aehnliche Waehrungen bewegen sich kaum",
  faktorRegime(w(leer, "EUR"), w(leer, "GBP"), RISK_OFF).dir, 0);
check("Beta-Rangfolge: JPY ist der staerkste Hafen",
  Math.min(...Object.values(RISIKO_BETA)), RISIKO_BETA.JPY);

/* ------------------------------------------------------------- Veto */
const cotReihe = (hoch: boolean): [string, number][] =>
  Array.from({ length: 60 }, (_, i) => [plusTage("2025-01-06", i * 7), i === 59 ? (hoch ? 999 : -999) : i % 10] as [string, number]);

const extrem = daten({ cot: { EUR: cotReihe(true), USD: cotReihe(false) } });
const vetoLang = baueVeto(w(extrem, "EUR"), w(extrem, "USD"));
check("EUR voll long + USD voll short = Veto gegen Long", vetoLang.gegen, 1);
check("Veto nennt beide Gruende", vetoLang.text.includes("EUR") && vetoLang.text.includes("USD"), true);

const gespreizt = daten({ cot: { EUR: cotReihe(true), USD: cotReihe(true) } });
check("beide am selben Extrem heben sich auf",
  baueVeto(w(gespreizt, "EUR"), w(gespreizt, "USD")).gegen, 0);
check("ohne COT-Historie kein Veto", baueVeto(w(leer, "EUR"), w(leer, "USD")).gegen, 0);
check("Veto-Grenzen sind symmetrisch", VETO_GRENZE.oben + VETO_GRENZE.unten, 100);

/* ------------------------------------------------- Veto nach COT-Gruppen */
// Der Kern der Trennung: Fonds und Real Money duerfen ein Veto ausloesen, die
// Banken nicht. Ihre Netto-Position ist mechanisch das Spiegelbild der
// anderen beiden — ein eigenes Veto waere dieselbe Zahl doppelt gezaehlt.
const cotMitte = (): [string, number][] =>
  Array.from({ length: 60 }, (_, i) => [plusTage("2025-01-06", i * 7), i === 59 ? 5 : i % 10] as [string, number]);

const nurReal = daten({
  cot: { EUR: cotMitte(), USD: cotMitte() },
  cotRealMoney: { EUR: cotReihe(true), USD: cotReihe(false) },
});
const vetoReal = baueVeto(w(nurReal, "EUR"), w(nurReal, "USD"));
check("Fonds neutral -> kein Fonds-Veto",
  baueVeto(w(daten({ cot: { EUR: cotMitte(), USD: cotMitte() } }), "EUR"),
           w(daten({ cot: { EUR: cotMitte(), USD: cotMitte() } }), "USD")).gegen, 0);
check("Real Money allein loest Veto aus", vetoReal.gegen, 1);
check("und nennt sich als Quelle", vetoReal.quellen, ["real-money"]);
check("Real-Money-Raenge stehen im Urteil",
  [vetoReal.realMoney.basis !== null, vetoReal.realMoney.quote !== null], [true, true]);

const nurBanken = daten({
  cot: { EUR: cotMitte(), USD: cotMitte() },
  cotBanken: { EUR: cotReihe(true), USD: cotReihe(false) },
});
const vetoBanken = baueVeto(w(nurBanken, "EUR"), w(nurBanken, "USD"));
check("Banken allein loesen KEIN Veto aus", vetoBanken.gegen, 0);
check("Banken werden trotzdem ausgewiesen", vetoBanken.banken.basis !== null, true);

const gegenlaeufig = daten({
  cot: { EUR: cotReihe(true), USD: cotMitte() },
  cotRealMoney: { EUR: cotReihe(false), USD: cotMitte() },
});
check("Fonds long, Real Money short -> hebt sich auf",
  baueVeto(w(gegenlaeufig, "EUR"), w(gegenlaeufig, "USD")).gegen, 0);
check("ohne TFF-Gruppen bleibt das Fonds-Veto allein bestehen", vetoLang.quellen, ["fonds"]);
check("fehlende Gruppen sind kein Fehler",
  [vetoLang.realMoney.basis, vetoLang.banken.basis], [null, null]);

/* ------------------------------------------------------------- Paar-Urteil */
const klar = daten({
  leitzins: { AUD: [["2026-01-01", 4.5]], JPY: [["2026-01-01", 0.5]] },
  cpi: { AUD: [["2026-01-01", 2.0]], JPY: [["2026-01-01", 3.0]] },
});

/* --------------------------------------------------- Faktor Zinserwartung */
// Gemessen wird (2J-Rendite − Leitzins) je Waehrung, verglichen zwischen
// beiden — also NUR das, was im Leitzins noch nicht steht.
const erwartungKlar = daten({
  leitzins: { EUR: [["2026-01-01", 2.0]], USD: [["2026-01-01", 4.0]] },
  // EUR: Markt preist +0.60 pp ein, USD: −0.40 pp -> 1.00 pp Unterschied
  zwei: { EUR: [["2026-08-13", 2.6]], USD: [["2026-08-13", 3.6]] },
});
check("Markt erwartet fuer EUR mehr als fuer USD",
  faktorErwartung(w(erwartungKlar, "EUR"), w(erwartungKlar, "USD")).dir, 1);
check("Staerke bei 1 pp Unterschied voll ausgereizt",
  faktorErwartung(w(erwartungKlar, "EUR"), w(erwartungKlar, "USD")).staerke, 1);

// Gegenprobe: dieselben 2J-Renditen, aber die Leitzinsdifferenz zeigt
// entgegengesetzt — der Faktor darf NICHT einfach die Zinsdifferenz spiegeln.
check("Zinsdifferenz zeigt hier nach unten",
  faktorZins(w(erwartungKlar, "EUR"), w(erwartungKlar, "USD")).dir, -1);

const erwartungGleich = daten({
  leitzins: { EUR: [["2026-01-01", 2.0]], USD: [["2026-01-01", 4.0]] },
  zwei: { EUR: [["2026-08-13", 2.1]], USD: [["2026-08-13", 4.1]] },
});
check("gleicher erwarteter Pfad = keine Richtung",
  faktorErwartung(w(erwartungGleich, "EUR"), w(erwartungGleich, "USD")).dir, 0);

check("ohne 2J-Rendite keine Aussage",
  faktorErwartung(w(daten({}), "GBP"), w(daten({}), "USD")).luecke,
  "keine 2J-Rendite für GBP");

const langAufAudJpy = bewertePaar(klar, "AUDJPY", STICHTAG, NEUTRAL, 1);
check("zwei Faktoren dafuer, keiner dagegen = Rueckenwind", langAufAudJpy.urteil, "rueckenwind");
// Seit dem Faktor Zinserwartung (19.08.2026) schweigen ZWEI: das Regime ist
// neutral, und diese Vorlage hat keine 2J-Renditen. dafuer/dagegen unberuehrt.
check("Zaehlung stimmt",
  [langAufAudJpy.dafuer, langAufAudJpy.dagegen, langAufAudJpy.stumm], [2, 0, 2]);
check("Einigkeit voll", langAufAudJpy.einigkeit, 1);

const shortAufAudJpy = bewertePaar(klar, "AUDJPY", STICHTAG, NEUTRAL, -1);
check("dieselbe Lage, andere Richtung = Gegenwind", shortAufAudJpy.urteil, "gegenwind");

// Mehrheit dagegen ist Gegenwind, auch wenn ein Faktor dafuer spricht -
// „uneinig" bleibt dem Fall vorbehalten, in dem die Mehrheit dafuer ist.
const shortImRiskOff = bewertePaar(klar, "AUDJPY", STICHTAG, RISK_OFF, -1);
check("1 dafuer, 2 dagegen = Gegenwind", shortImRiskOff.urteil, "gegenwind");
check("und zaehlt 1:2", [shortImRiskOff.dafuer, shortImRiskOff.dagegen], [1, 2]);
check("der Satz nennt beide Seiten",
  shortImRiskOff.satz.includes("1 dafür, 2 dagegen"), true);

const langImRiskOff = bewertePaar(klar, "AUDJPY", STICHTAG, RISK_OFF, 1);
check("2 dafuer, 1 dagegen = uneinig", langImRiskOff.urteil, "gemischt");
check("Einigkeit sinkt auf ein Drittel",
  langImRiskOff.einigkeit?.toFixed(2), "0.33");

check("ohne Daten: zu wenig",
  bewertePaar(LEERE_DATEN, "EURUSD", STICHTAG, KEIN_REGIME, 1).urteil, "zuwenig");
check("und der Satz sagt das auch",
  bewertePaar(LEERE_DATEN, "EURUSD", STICHTAG, KEIN_REGIME, 1).satz.includes("fehlen die Daten"), true);

// Ohne gefragte Richtung nimmt das Urteil die eigene.
const ohneFrage = bewertePaar(klar, "AUDJPY", STICHTAG, NEUTRAL, 0);
check("eigene Richtung wird gefunden", ohneFrage.gefragt, 1);
check("Paarname wird normiert", bewertePaar(klar, "audjpy", STICHTAG, NEUTRAL, 1).paar, "AUDJPY");

// Veto schlaegt nicht die Richtung um, es haengt sich nur dran.
const mitVeto = bewertePaar(
  { ...klar, cot: { AUD: r(...cotReihe(true)), JPY: r(...cotReihe(false)) } },
  "AUDJPY", STICHTAG, NEUTRAL, 1,
);
check("Veto aktiv", mitVeto.vetoAktiv, true);
check("Veto dreht das Urteil NICHT um", mitVeto.urteil, "rueckenwind");
check("aber der Satz erwaehnt es", mitVeto.satz.includes("COT-Veto"), true);
check("gegen die andere Richtung greift dasselbe Veto nicht",
  bewertePaar(
    { ...klar, cot: { AUD: r(...cotReihe(true)), JPY: r(...cotReihe(false)) } },
    "AUDJPY", STICHTAG, NEUTRAL, -1,
  ).vetoAktiv, false);

/* ------------------------------------------------------------- Ampel */
// Die Ampel ist die einzige Zahl, die Kerim im Terminal wirklich liest —
// deshalb wird hier die REIHENFOLGE der Pruefungen festgenagelt: was ein
// Setup verbietet, muss vor dem stehen, was es empfiehlt.

// `klar` traegt Daten vom 01.01. — am Stichtag 225 Tage alt und damit fuer
// eine Monatsserie "veraltet". Fuer die Ampel braucht es deshalb eine eigene
// Vorlage, sonst prueft man versehentlich den Frische-Zweig statt der Staerke.
// 45 Tage ist genau die Kante: frueher darf der Wert nicht benutzt werden
// (Publikationsverzug), spaeter gilt er als alt.
const FRISCH_TAG = plusTage(STICHTAG, -45);
const frischKlar = daten({
  leitzins: { AUD: [[FRISCH_TAG, 4.5]], JPY: [[FRISCH_TAG, 0.5]] },
  cpi: { AUD: [[FRISCH_TAG, 2.0]], JPY: [[FRISCH_TAG, 3.0]] },
});
const audJpyLang = bewertePaar(frischKlar, "AUDJPY", STICHTAG, NEUTRAL, 0);
check("klares Paar ohne Veto ist gruen", ampelFuer(audJpyLang).stufe, "gruen");
check("und die Ampel nennt die eigene Richtung", ampelFuer(audJpyLang).richtung, 1);
check("dieselbe Lage mit alten Daten ist nur gelb",
  ampelFuer(bewertePaar(klar, "AUDJPY", STICHTAG, NEUTRAL, 0)).stufe, "gelb");

check("ohne Daten ist die Ampel rot",
  ampelFuer(bewertePaar(leer, "EURUSD", STICHTAG, KEIN_REGIME, 0)).stufe, "rot");
check("ohne Richtung ist die Ampel rot",
  ampelFuer(bewertePaar(knapp, "EURUSD", STICHTAG, NEUTRAL, 0)).stufe, "rot");

// Der wichtigste Fall: starke Richtung UND Veto genau dagegen. Das Veto muss
// gewinnen, sonst waere es keins.
const klarMitVeto = bewertePaar(
  { ...frischKlar, cot: { AUD: r(...cotReihe(true)), JPY: r(...cotReihe(false)) } },
  "AUDJPY", STICHTAG, NEUTRAL, 0,
);
check("Veto gegen die eigene Richtung macht rot", ampelFuer(klarMitVeto).stufe, "rot");
check("und die Begruendung sagt warum",
  ampelFuer(klarMitVeto).grund.includes("Veto"), true);
check("Ampel-Schwelle ist bewusst nicht null", AMPEL_SCHWELLE.klar > 0, true);

/* ------------------------------------------------------------- Matrix */
const alleFuerMatrix = bewerteAlle(frischKlar, STICHTAG, NEUTRAL);
const matrix = baueMatrix(alleFuerMatrix);
check("Matrix ist 8x8", [matrix.length, matrix[0].length], [8, 8]);
check("Diagonale bleibt leer",
  G8.every((_, i) => matrix[i][i].paar === ""), true);

const iAud = G8.indexOf("AUD");
const iJpy = G8.indexOf("JPY");
check("AUDJPY steht direkt in der Matrix", matrix[iAud][iJpy].gedreht, false);
check("JPYAUD ist die Spiegelung", matrix[iJpy][iAud].gedreht, true);
check("die Spiegelung dreht die Richtung",
  matrix[iJpy][iAud].richtung, -matrix[iAud][iJpy].richtung);
check("die Spiegelung dreht das Netto",
  Math.round(matrix[iJpy][iAud].netto * 1000), -Math.round(matrix[iAud][iJpy].netto * 1000));
// Der Punkt der Trennung: die Farbe darf NICHT davon abhaengen, wie herum das
// Paar notiert ist. Nur Richtung und Netto drehen.
check("die Ampelstufe dreht NICHT mit",
  matrix[iJpy][iAud].stufe, matrix[iAud][iJpy].stufe);
check("beide Haelften zeigen auf dasselbe kanonische Paar",
  matrix[iJpy][iAud].paar, matrix[iAud][iJpy].paar);

// Erst die Gegenprobe: eine leere Liste wuerde jede "every"-Pruefung darunter
// stillschweigend bestehen.
check("handelbar ist bei klarer Lage nicht leer", handelbare(alleFuerMatrix).length > 0, true);
check("handelbar liefert nur gruene Paare",
  handelbare(alleFuerMatrix).every((x) => x.a.stufe === "gruen"), true);
check("handelbar ist nach Staerke sortiert",
  handelbare(alleFuerMatrix).every((x, i, a) =>
    i === 0 || Math.abs(a[i - 1].u.netto) >= Math.abs(x.u.netto)), true);
check("ohne Daten ist nichts handelbar",
  handelbare(bewerteAlle(leer, STICHTAG, KEIN_REGIME)).length, 0);

/* ------------------------------------------------------------- Übersicht */
check("alle 28 Paare", bewerteAlle(klar, STICHTAG, NEUTRAL).length, 28);
check("Paarliste ohne Dubletten", new Set(PAARE).size, PAARE.length);
check("jedes Paar hat sechs Zeichen", PAARE.every((p) => p.length === 6), true);

const alle = bewerteAlle(klar, STICHTAG, RISK_OFF);
const jpyBild = waehrungsBild(klar, "JPY", STICHTAG, alle);
const audBild = waehrungsBild(klar, "AUD", STICHTAG, alle);
// Der Score wird gegen seine eigene Definition geprueft, nicht gegen ein
// erwartetes Vorzeichen: was zaehlt, ist dass die Quote-Seite gedreht eingeht.
// Ein Vorzeichentest waere vom Regime abhaengig und damit kein Beweis.
const scoreVonHand = (ccy: string) =>
  alle.filter((u) => u.basis === ccy || u.quote === ccy)
    .reduce((s, u) => s + (u.basis === ccy ? u.netto : -u.netto), 0) / 7 * 100;
check("Score ist der gedrehte Mittelwert der sieben Paare",
  Math.round(audBild.score * 1000), Math.round(scoreVonHand("AUD") * 1000));
check("und die Quote-Seite geht mit gedrehtem Vorzeichen ein",
  Math.round(jpyBild.score * 1000), Math.round(scoreVonHand("JPY") * 1000));

// Eine fehlende Quelle darf die Ampel nicht auf Gelb ziehen — sonst staenden
// GBP-, CHF- und NZD-Paare dauerhaft dort, weil es fuer sie keine
// 2-Jahres-Rendite gibt. Genau das war der Fehler beim ersten Wurf.
check("fehlende 2J-Quelle allein macht nicht gelb",
  ampelFuer(bewertePaar(frischKlar, "AUDJPY", STICHTAG, NEUTRAL, 0)).stufe, "gruen");
check("JPY und AUD betrachten dieselben sieben Paare",
  [jpyBild.dafuer + jpyBild.dagegen + jpyBild.stumm,
   audBild.dafuer + audBild.dagegen + audBild.stumm], [7, 7]);
check("im Risk-off steht der Yen besser als der Aussie",
  jpyBild.saldo > audBild.saldo, true);
check("Werte der Waehrung sind mit drin", jpyBild.leitzins, 0.5);
check("Realzins gerechnet", audBild.realzins?.toFixed(1), "2.5");

/* ------------------------------------------------------------- COT-Netto */
check("Netto als Anteil am Open Interest",
  nettoReihe([{ datum: "2026-01-06", lang: 300, kurz: 100, oi: 1000 }]),
  [{ datum: "2026-01-06", wert: 0.2 }]);
check("Zeile ohne Open Interest wird verworfen",
  nettoReihe([{ datum: "2026-01-06", lang: 300, kurz: 100, oi: 0 }]), []);
check("Zeile mit fehlender Seite wird verworfen",
  nettoReihe([{ datum: "2026-01-06", lang: null, kurz: 100, oi: 1000 }]), []);
check("Netto wird nach Datum sortiert",
  nettoReihe([
    { datum: "2026-02-03", lang: 1, kurz: 0, oi: 10 },
    { datum: "2026-01-06", lang: 1, kurz: 0, oi: 10 },
  ]).map((p) => p.datum),
  ["2026-01-06", "2026-02-03"]);

/* ------------------------------------------------------------- Wilson */
check("kein Material", wilson(0, 0).quote, null);
check("Quote gerechnet", wilson(6, 10).quote, 0.6);
check("Intervall bleibt in [0,1] bei null Treffern",
  [wilson(0, 10).unten, wilson(0, 10).oben! <= 1], [0, true]);
check("Intervall bei 10 von 10 endet bei 1", wilson(10, 10).oben, 1);
check("kleine Stichprobe ergibt breites Intervall",
  wilson(6, 10).oben! - wilson(6, 10).unten! > wilson(60, 100).oben! - wilson(60, 100).unten!, true);

/* ------------------------------------------------------------- Bilanz */
const tu = (p: Partial<TradeUrteil>): TradeUrteil => ({
  id: Math.random().toString(36).slice(2), datum: "2026-05-01", paar: "EURUSD",
  richtung: 1, r: 1, gewonnen: true, urteil: "rueckenwind",
  dafuer: 2, dagegen: 0, vetoAktiv: false, ...p,
});

check("leichter Rueckenwind zaehlt ins selbe Lager", lagerVon("leichter-rueckenwind"), "rueckenwind");
check("uneinig ist ein eigenes Lager", lagerVon("gemischt"), "uneinig");
check("zu wenig Daten landet bei ohne", lagerVon("zuwenig"), "ohne");
check("neutral landet auch bei ohne", lagerVon("neutral"), "ohne");

const wenige = gruppiere([
  ...Array.from({ length: 5 }, () => tu({ gewonnen: true })),
  ...Array.from({ length: 5 }, () => tu({ urteil: "gegenwind", gewonnen: false, r: -1 })),
]);
check("Gruppen zaehlen richtig",
  wenige.map((g) => g.n), [5, 0, 5, 0]);
check("bei wenig Material kein Urteil", vergleiche(wenige).befund, "zu-wenig");

// Break-even zaehlt in n, aber nicht in die Quote.
const mitBe = gruppiere([
  tu({ gewonnen: true }), tu({ gewonnen: false, r: -1 }), tu({ gewonnen: null, r: 0 }),
]);
check("Break-even zaehlt zur Gruppengroesse", mitBe[0].n, 3);
check("aber nicht in die Trefferquote", mitBe[0].quote.n, 2);
check("Summe R rechnet alle mit", mitBe[0].summeR, 0);

// Deutlicher Unterschied, genug Material: 45 von 50 gegen 10 von 50.
const deutlich = gruppiere([
  ...Array.from({ length: 45 }, () => tu({ gewonnen: true })),
  ...Array.from({ length: 5 }, () => tu({ gewonnen: false, r: -1 })),
  ...Array.from({ length: 10 }, () => tu({ urteil: "gegenwind", gewonnen: true })),
  ...Array.from({ length: 40 }, () => tu({ urteil: "gegenwind", gewonnen: false, r: -1 })),
]);
check("klarer Unterschied wird als belegt gemeldet", vergleiche(deutlich).befund, "traegt");
check("Abstand in Punkten", vergleiche(deutlich).abstand?.toFixed(0), "70");

// Knapper Unterschied bei mittlerem Material: kein Nachweis.
const knappVergleich = gruppiere([
  ...Array.from({ length: 17 }, () => tu({ gewonnen: true })),
  ...Array.from({ length: 13 }, () => tu({ gewonnen: false, r: -1 })),
  ...Array.from({ length: 14 }, () => tu({ urteil: "gegenwind", gewonnen: true })),
  ...Array.from({ length: 16 }, () => tu({ urteil: "gegenwind", gewonnen: false, r: -1 })),
]);
check("knapper Unterschied ist kein Nachweis", vergleiche(knappVergleich).befund, "kein-nachweis");
check("und der Satz sagt das deutlich",
  vergleiche(knappVergleich).satz.includes("kein Nachweis"), true);

// Der unbequeme Fall: gegen die Lage lief es besser.
const verkehrt = gruppiere([
  ...Array.from({ length: 10 }, () => tu({ gewonnen: true })),
  ...Array.from({ length: 40 }, () => tu({ gewonnen: false, r: -1 })),
  ...Array.from({ length: 45 }, () => tu({ urteil: "gegenwind", gewonnen: true })),
  ...Array.from({ length: 5 }, () => tu({ urteil: "gegenwind", gewonnen: false, r: -1 })),
]);
check("verkehrte Wirkung wird benannt", vergleiche(verkehrt).befund, "verkehrt");
check("Schwelle je Seite", MIN_JE_SEITE, 15);

/* ------------------------------------------------------------- Veto */
check("zu wenig Veto-Trades",
  vetoBilanz([tu({ vetoAktiv: true }), ...Array.from({ length: 30 }, () => tu({}))])
    .satz.includes("zu wenig"), true);
check("Veto-Bilanz trennt beide Seiten",
  vetoBilanz([
    ...Array.from({ length: 20 }, () => tu({ vetoAktiv: true, gewonnen: false })),
    ...Array.from({ length: 20 }, () => tu({ vetoAktiv: false, gewonnen: true })),
  ]).satz.includes("belegt"), true);

/* ------------------------------------------------------------- Aufteilung */
const verteilung = aufteilung([
  tu({ urteil: "rueckenwind" }), tu({ urteil: "rueckenwind" }),
  tu({ urteil: "gegenwind" }), tu({ urteil: "neutral" }),
]);
check("nur belegte Urteile erscheinen", verteilung.length, 3);
check("Anteil gerechnet", verteilung[0].anteil, 0.5);
check("Anteile summieren sich auf 1",
  verteilung.reduce((s, a) => s + a.anteil, 0), 1);

/* ------------------------------------------------- Tiefere Auswertung */
// Zwei Dinge werden hier festgenagelt, weil beide leicht falsch herum gebaut
// werden: dass ein stummer Faktor aus BEIDEN Seiten faellt (nicht bei
// "dagegen" landet), und dass die Faktor-Richtung am TRADE gemessen wird
// (bei einem Short spricht dir = -1 FUER den Trade).

const tt = (p: Partial<TiefenTrade>): TiefenTrade => ({
  ...tu({}), ergebnis: "full_tp", faktoren: [], link: null, ...p,
});

const ERGEBNISSE = ["full_tp", "teil_tp_be", "breakeven", "sl"];

const kreuz = ergebnisKreuz([
  tt({ urteil: "rueckenwind", ergebnis: "full_tp", r: 2, gewonnen: true }),
  tt({ urteil: "leichter-rueckenwind", ergebnis: "sl", r: -1, gewonnen: false }),
  tt({ urteil: "gegenwind", ergebnis: "sl", r: -1, gewonnen: false }),
  tt({ urteil: "neutral", ergebnis: "breakeven", r: 0, gewonnen: null }),
], ERGEBNISSE);

check("Kreuz hat vier Lager", kreuz.map((z) => z.lager),
  ["rueckenwind", "uneinig", "gegenwind", "ohne"]);
check("leichter Rueckenwind faellt ins selbe Lager", kreuz[0].n, 2);
check("Ergebnisse werden je Lager gezaehlt", kreuz[0].proErgebnis, [1, 0, 0, 1]);
check("Summe R je Lager", kreuz[0].gesamtR, 1);
// Break-even zaehlt zur Gruppengroesse, aber nicht in die Trefferquote —
// dieselbe Konvention wie in bilanz.gruppiere.
check("Break-even ist in n, nicht in der Quote",
  [kreuz[3].n, kreuz[3].quote.n], [1, 0]);
check("jeder Trade landet in genau einem Lager",
  kreuz.reduce((s, z) => s + z.n, 0), 4);

// --- Faktor-Bilanz
const mitFaktor = (dir: -1 | 0 | 1, rest: Partial<TiefenTrade> = {}) =>
  tt({ faktoren: [{ key: "zins", dir }], ...rest });

const bilanzZins = faktorBilanz([
  ...Array.from({ length: 20 }, () => mitFaktor(1, { r: 1, gewonnen: true })),
  ...Array.from({ length: 20 }, () => mitFaktor(-1, { r: -1, gewonnen: false })),
  ...Array.from({ length: 7 }, () => mitFaktor(0, { r: 1, gewonnen: true })),
], ["zins"])[0];
check("dafuer und dagegen werden getrennt gezaehlt",
  [bilanzZins.dafuer.n, bilanzZins.dagegen.n], [20, 20]);
check("stumme Trades fallen aus BEIDEN Seiten", bilanzZins.stumm, 7);
check("klarer Unterschied wird als tragend gemeldet", bilanzZins.befund, "traegt");
check("Abstand in Punkten", bilanzZins.abstand?.toFixed(0), "100");

// Derselbe Faktor, aber alle Trades sind Shorts: dir = -1 spricht dann FUER
// den Trade. Ohne die Multiplikation mit t.richtung stuende hier alles auf
// dem Kopf — und die Tabelle wuerde jeden Faktor als "verkehrt" melden.
const bilanzShort = faktorBilanz([
  ...Array.from({ length: 20 }, () => mitFaktor(-1, { richtung: -1, r: 1, gewonnen: true })),
  ...Array.from({ length: 20 }, () => mitFaktor(1, { richtung: -1, r: -1, gewonnen: false })),
], ["zins"])[0];
check("bei Shorts dreht sich die Faktor-Richtung mit",
  [bilanzShort.dafuer.n, bilanzShort.dagegen.n, bilanzShort.befund], [20, 20, "traegt"]);

check("kleine Stichprobe ergibt kein Urteil",
  faktorBilanz([
    ...Array.from({ length: 5 }, () => mitFaktor(1, { r: 1, gewonnen: true })),
    ...Array.from({ length: 5 }, () => mitFaktor(-1, { r: -1, gewonnen: false })),
  ], ["zins"])[0].befund, "zu-wenig");

check("umgekehrte Wirkung wird benannt",
  faktorBilanz([
    ...Array.from({ length: 20 }, () => mitFaktor(1, { r: -1, gewonnen: false })),
    ...Array.from({ length: 20 }, () => mitFaktor(-1, { r: 1, gewonnen: true })),
  ], ["zins"])[0].befund, "verkehrt");

check("ein Faktor ohne Eintrag gilt als stumm, nicht als dagegen",
  faktorBilanz([tt({ faktoren: [] })], ["erwartung"])[0].stumm, 1);
check("jeder Faktor bekommt eine Zeile",
  faktorBilanz([], ["zins", "erwartung", "real"]).map((z) => z.key),
  ["zins", "erwartung", "real"]);

// --- Kandidaten fuer die Screenshot-Runde
const kandidaten = auffaellige([
  tt({ urteil: "rueckenwind", ergebnis: "sl", link: "https://tv/1" }),
  tt({ urteil: "rueckenwind", ergebnis: "sl", link: null }),
  tt({ urteil: "gegenwind", ergebnis: "full_tp", link: "https://tv/2" }),
  tt({ urteil: "rueckenwind", ergebnis: "full_tp", link: "https://tv/3" }),
], "sl", "full_tp");
check("beide Widerspruchs-Gruppen erscheinen",
  kandidaten.map((g) => g.titel),
  ["Stop trotz Rückenwind", "Volles Ziel gegen die Lage"]);
check("ohne Link kein Kandidat", kandidaten[0].trades.length, 1);
// Der erwartungsgemaesse Fall (Rueckenwind -> volles Ziel) ist KEIN
// Widerspruch und gehoert nicht in die Liste.
check("erwartungsgemaesse Trades stehen nicht drin",
  kandidaten.every((g) => g.trades.every((t) => t.link !== "https://tv/3")), true);
check("leere Gruppen fallen weg",
  auffaellige([tt({ urteil: "neutral", ergebnis: "breakeven" })], "sl", "full_tp").length, 0);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
