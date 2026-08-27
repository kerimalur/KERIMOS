// Kontrollwerte für die Duplikatprüfung im Journal (ab 27.08.2026).
// Aufruf:  npx -y tsx tools/checks/duplikat.mts
import {
  findeDuplikat, duplikatText, pipGroesse, PIP_TOLERANZ, TAG_TOLERANZ,
  type Kandidat,
} from "../../src/lib/trading/duplikat";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const k = (p: Partial<Kandidat> = {}): Kandidat => ({
  id: "a", pair: "EURCHF", direction: "long", date: "2026-08-20",
  entryPrice: 0.9320, rMultiple: 1.5, status: "closed", ...p,
});
const neu = (p: Partial<{ pair: string; direction: string; date: string; entryPrice: number | null }> = {}) => ({
  pair: "EURCHF", direction: "long", date: "2026-08-20", entryPrice: 0.9320, ...p,
});
const treffer = (n: ReturnType<typeof neu>, b: Kandidat[]) => findeDuplikat(n, b)?.id ?? null;

check("derselbe Trade wird gefunden", treffer(neu(), [k()]), "a");
check("leerer Bestand gibt nichts", treffer(neu(), []), null);
check("anderes Paar zaehlt nicht", treffer(neu({ pair: "EURUSD" }), [k()]), null);
check("andere Richtung zaehlt nicht", treffer(neu({ direction: "short" }), [k()]), null);
check("Gross- und Kleinschreibung egal", treffer(neu({ pair: "eurchf" }), [k()]), "a");

/* ------------------------------------------------------------- Datum */
check("einen Tag frueher zaehlt noch",
  treffer(neu({ date: "2026-08-19" }), [k()]), "a");
check("einen Tag spaeter auch",
  treffer(neu({ date: "2026-08-21" }), [k()]), "a");
check("zwei Tage sind zu viel",
  treffer(neu({ date: "2026-08-22" }), [k()]), null);
check("Toleranz ist ein Tag", TAG_TOLERANZ, 1);

/* -------------------------------------------------------------- Preis */
// 15 Pips sind bei EURCHF 0.0015, bei einem JPY-Paar 0.15.
check("Pip-Groesse ohne JPY", pipGroesse("EURCHF"), 0.0001);
check("Pip-Groesse mit JPY", pipGroesse("USDJPY"), 0.01);
check("Toleranz sind 15 Pips", PIP_TOLERANZ, 15);

check("genau auf der Toleranz zaehlt noch",
  treffer(neu({ entryPrice: 0.9320 + 0.0015 }), [k()]), "a");
check("knapp darueber nicht mehr",
  treffer(neu({ entryPrice: 0.9320 + 0.0016 }), [k()]), null);
check("nach unten genauso",
  treffer(neu({ entryPrice: 0.9320 - 0.0015 }), [k()]), "a");
// Beim JPY-Paar ist dieselbe Zahl an Pips ein hundertmal groesserer Abstand.
check("JPY: 10 Pips liegen drin",
  treffer(neu({ pair: "USDJPY", entryPrice: 150.10 }),
    [k({ pair: "USDJPY", entryPrice: 150.00 })]), "a");
check("JPY: 20 Pips nicht mehr",
  treffer(neu({ pair: "USDJPY", entryPrice: 150.20 }),
    [k({ pair: "USDJPY", entryPrice: 150.00 })]), null);

/* ---------------------------------------------- Ohne Preis kein Urteil */
// Der wichtigste Wert der Datei. Paar + Richtung + Tag treffen auf jeden
// zweiten Einstieg an einer Linie zu — eine Warnung, die staendig kommt,
// wird weggeklickt und schuetzt dann vor gar nichts.
check("ohne Einstieg im Neuling keine Warnung",
  treffer(neu({ entryPrice: null }), [k()]), null);
// Der Wert, der die Pruefung WIRKLICH prueft: steht im Bestand ein Einstieg
// nahe null, wuerde ein fehlender Preis ohne die Abfrage zu 0 werden und
// treffen. Der Test oben lief auch ohne die Pruefung gruen — aufgefallen
// erst beim absichtlichen Kaputtmachen.
check("null wird nicht heimlich zu 0",
  treffer(neu({ pair: "XAUUSD", entryPrice: null }),
    [k({ pair: "XAUUSD", entryPrice: 0.0005 })]), null);
check("ohne Einstieg im Bestand auch nicht",
  treffer(neu(), [k({ entryPrice: null })]), null);
check("unendlich ist kein Preis",
  treffer(neu({ entryPrice: Infinity }), [k()]), null);

/* ---------------------------------------- Der erste Treffer, nicht irgendeiner */
check("der erste passende gewinnt",
  treffer(neu(), [k({ id: "eins" }), k({ id: "zwei" })]), "eins");

/* --------------------------------------------------------------- Text */
check("der Satz nennt Zahlen",
  duplikatText(k()), "EURCHF Long vom 2026-08-20, Einstieg 0.932, 1.5 R");
check("laufender Trade sagt das",
  duplikatText(k({ status: "open" })),
  "EURCHF Long vom 2026-08-20, Einstieg 0.932, läuft noch");
check("ohne Einstieg steht es dran",
  duplikatText(k({ entryPrice: null })),
  "EURCHF Long vom 2026-08-20, ohne Einstieg, 1.5 R");

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
