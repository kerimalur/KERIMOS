// Kontrollwerte für die COT-Gruppenzuordnung.
// Aufruf:  npx -y tsx tools/checks/cot-gruppen.mts
//
// Diese Datei existiert wegen eines konkreten Fehlers, nicht auf Verdacht.
// Am 20.08.2026 blieb die Monty-Tabelle leer. Zwei Erklaerungen wurden geprueft
// und beide waren falsch: es war nicht der Cache, und es waren nicht die
// Rohdaten — cot_reports ist lueckenlos ab 2006 gefuellt (13.345 Zeilen).
// Der Fehler lag in der Ladeschleife: Commercials und Nicht-Meldepflichtige
// wurden ERST NACH dem TFF-Zweig zugewiesen, hinter dessen `continue`. Und der
// greift, sobald der TFF-Bericht genug Wochen hat — also bei jeder einzelnen
// G8-Waehrung. Die beiden Reihen wurden nie gefuellt.
//
// Der entscheidende Fall ist deshalb der erste: TFF gewinnt UND Commercials
// sind trotzdem da. Genau das war vorher nicht der Fall.
import { cotGruppenFuer, MIN_TFF_WOCHEN, type TffZeile, type LegacyZeile } from "../../src/lib/confluence/cot-gruppen";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const tag = (i: number) => `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`;

const tffZeilen = (n: number): TffZeile[] => Array.from({ length: n }, (_, i) => ({
  contract_code: "099741", report_date: tag(i),
  lev_money_long: 1000 + i, lev_money_short: 400,
  dealer_long: 500, dealer_short: 900 + i,
  asset_mgr_long: 700 + i, asset_mgr_short: 300,
  open_interest: 100_000,
}));

const legacyZeilen = (n: number): LegacyZeile[] => Array.from({ length: n }, (_, i) => ({
  contract_code: "099741", report_date: tag(i),
  noncomm_long: 1200 + i, noncomm_short: 500,
  comm_long: 800, comm_short: 1500 + i,
  nonrept_long: 600 + i, nonrept_short: 200,
  open_interest: 100_000,
}));

// --- Der Regressionsfall -------------------------------------------------
// TFF hat genug Wochen und gewinnt die Quellenwahl. Commercials und Retail
// muessen TROTZDEM gefuellt sein: der TFF-Bericht kennt diese Gruppen gar
// nicht, sie koennen nur aus Legacy kommen.
{
  const g = cotGruppenFuer(tffZeilen(60), legacyZeilen(60));
  check("TFF gewinnt -> quelle", g.quelle, "tff");
  check("TFF gewinnt -> Commercials trotzdem da", g.komm.length, 60);
  check("TFF gewinnt -> Retail trotzdem da", g.retail.length, 60);
  check("TFF gewinnt -> Fonds aus TFF", g.fonds.length, 60);
  check("TFF gewinnt -> Banken da", g.banken.length, 60);
  check("TFF gewinnt -> Real Money da", g.realMoney.length, 60);
}

// --- Kein TFF ------------------------------------------------------------
{
  const g = cotGruppenFuer([], legacyZeilen(60));
  check("ohne TFF -> quelle", g.quelle, "legacy");
  check("ohne TFF -> Commercials da", g.komm.length, 60);
  check("ohne TFF -> Banken leer", g.banken.length, 0);
  check("ohne TFF -> Real Money leer", g.realMoney.length, 0);
}

// --- TFF zu kurz: Schwelle scharf pruefen --------------------------------
// Eine Woche unter der Schwelle muss Legacy gewinnen, genau auf der Schwelle
// TFF. Sonst ist die Grenze nur behauptet.
{
  const knappDrunter = cotGruppenFuer(tffZeilen(MIN_TFF_WOCHEN - 1), legacyZeilen(60));
  check("TFF eine Woche zu kurz -> legacy", knappDrunter.quelle, "legacy");
  check("TFF zu kurz -> Fonds aus Legacy", knappDrunter.fonds.length, 60);
  check("TFF zu kurz -> Commercials da", knappDrunter.komm.length, 60);

  const genau = cotGruppenFuer(tffZeilen(MIN_TFF_WOCHEN), legacyZeilen(60));
  check("TFF genau auf der Schwelle -> tff", genau.quelle, "tff");
}

// --- Gar nichts ----------------------------------------------------------
{
  const g = cotGruppenFuer([], []);
  check("nichts -> quelle", g.quelle, "keine");
  check("nichts -> alles leer", [g.komm.length, g.retail.length, g.fonds.length], [0, 0, 0]);
}

// --- Vorzeichen ----------------------------------------------------------
// Commercials stehen hier short (comm_long 800 < comm_short 1500+), Retail
// long. Waeren die Felder vertauscht, kaeme das Vorzeichen falsch heraus und
// die ganze Divergenz-Auswertung stuende auf dem Kopf.
{
  const g = cotGruppenFuer([], legacyZeilen(60));
  check("Commercials netto short", g.komm[0].wert < 0, true);
  check("Retail netto long", g.retail[0].wert > 0, true);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
