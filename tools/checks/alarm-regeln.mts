// Kontrollwerte für die Alarm-Regeln.
// Aufruf:  npx -y tsx tools/checks/alarm-regeln.mts
//
// Alles hier ist rein rechnerisch - keine Datenbank, kein Netz. Genau
// deshalb lässt es sich prüfen: ein Alarmsystem, dessen Filter man nur im
// Ernstfall testen kann, merkt man erst, wenn es zu Unrecht schweigt.
import {
  pruefe, inRuhezeit, minutenAus, alsUhrzeit, normPaar, paarErlaubt,
  ausFormular, warnungen, STANDARD_EINSTELLUNGEN,
  type AlarmEinstellungen,
} from "../../src/lib/alarm/regeln";
import { ausZeile, zurZeile, istTabelleFehlt } from "../../src/lib/alarm/speicher";
import {
  escapeHtml, baueTelegramText, fasseZusammen, irgendwoAngekommen,
  type VersandErgebnis,
} from "../../src/lib/alarm/text";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const e = (p: Partial<AlarmEinstellungen> = {}): AlarmEinstellungen => ({
  ...STANDARD_EINSTELLUNGEN, arten: [...STANDARD_EINSTELLUNGEN.arten], paare: [], ...p,
});

const HEUTE = "2026-08-14";
const lage = (p: Partial<Parameters<typeof pruefe>[1]> = {}) => ({
  art: "hit" as const, jetztMinuten: 600, heute: HEUTE, ...p,
});

/* ------------------------------------------------------------- Uhrzeiten */
check("minutenAus HH:MM", minutenAus("22:30"), 1350);
check("minutenAus HH:MM:SS (Postgres time)", minutenAus("22:30:00"), 1350);
check("minutenAus mit Leerzeichen", minutenAus("  07:05 "), 425);
check("minutenAus leer", minutenAus(""), null);
check("minutenAus null", minutenAus(null), null);
check("minutenAus Unsinn", minutenAus("25:00"), null);
check("minutenAus Text", minutenAus("abends"), null);
check("alsUhrzeit 0", alsUhrzeit(0), "00:00");
check("alsUhrzeit 1350", alsUhrzeit(1350), "22:30");
check("alsUhrzeit rollt ueber", alsUhrzeit(1440 + 90), "01:30");

/* ------------------------------------------------------------- Ruhezeit */
check("Ruhezeit ueber Mitternacht: 23:00 ruht", inRuhezeit(23 * 60, "22:00", "07:00"), true);
check("Ruhezeit ueber Mitternacht: 03:00 ruht", inRuhezeit(3 * 60, "22:00", "07:00"), true);
check("Ruhezeit ueber Mitternacht: 12:00 ruht nicht", inRuhezeit(12 * 60, "22:00", "07:00"), false);
check("Anfang gehoert dazu", inRuhezeit(22 * 60, "22:00", "07:00"), true);
check("Ende gehoert NICHT dazu", inRuhezeit(7 * 60, "22:00", "07:00"), false);
check("Ruhezeit am Tag: 13:00 ruht", inRuhezeit(13 * 60, "12:00", "14:00"), true);
check("Ruhezeit am Tag: 15:00 ruht nicht", inRuhezeit(15 * 60, "12:00", "14:00"), false);
check("nur eine Zeit gesetzt = unwirksam", inRuhezeit(23 * 60, "22:00", null), false);
check("gleiche Zeiten = unwirksam, nicht dauerruhig",
  inRuhezeit(3 * 60, "22:00", "22:00"), false);

/* ------------------------------------------------------------- Paare */
check("normPaar Schrägstrich", normPaar("eur/usd"), "EURUSD");
check("normPaar Unterstrich", normPaar("EUR_USD"), "EURUSD");
check("normPaar Leerzeichen", normPaar(" eurusd "), "EURUSD");
check("leere Liste heisst alle", paarErlaubt(e({ paare: [] }), "GBPJPY"), true);
check("Liste trifft", paarErlaubt(e({ paare: ["EURUSD"] }), "eur/usd"), true);
check("Liste trifft nicht", paarErlaubt(e({ paare: ["EURUSD"] }), "GBPJPY"), false);

/* ------------------------------------------------------------- pruefe */
check("Standard laesst Treffer durch", pruefe(e(), lage()).erlaubt, true);
check("kein Kanal an blockiert",
  pruefe(e({ push_an: false, telegram_an: false }), lage()).grund,
  "kein Kanal eingeschaltet");
check("Telegram allein reicht",
  pruefe(e({ push_an: false, telegram_an: true }), lage()).erlaubt, true);
check("abgewaehlte Art blockiert",
  pruefe(e({ arten: ["hit"] }), lage({ art: "naehe" })).grund,
  'Art „Vorwarnung" ist aus');
check("Paar nicht auf der Liste",
  pruefe(e({ paare: ["EURUSD"] }), lage({ pair: "GBPJPY" })).grund,
  "GBPJPY steht nicht auf der Paarliste");
check("Paar auf der Liste",
  pruefe(e({ paare: ["EURUSD"] }), lage({ pair: "EURUSD" })).erlaubt, true);

// Ruhezeit: der Treffer ist die Ausnahme, alles andere schweigt.
const nachts = e({ ruhe_von: "22:00", ruhe_bis: "07:00" });
check("Treffer nachts geht raus (Ausnahme an)",
  pruefe(nachts, lage({ art: "hit", jetztMinuten: 23 * 60 })).erlaubt, true);
check("Vorwarnung nachts bleibt still",
  pruefe(nachts, lage({ art: "naehe", jetztMinuten: 23 * 60 })).erlaubt, false);
check("Erinnerung nachts bleibt still",
  pruefe(nachts, lage({ art: "zeit", jetztMinuten: 3 * 60 })).erlaubt, false);
check("Treffer nachts still, wenn Ausnahme aus",
  pruefe(e({ ...nachts, ruhe_ausser_hit: false }), lage({ art: "hit", jetztMinuten: 23 * 60 })).erlaubt,
  false);
check("tagsueber alles frei",
  pruefe(nachts, lage({ art: "naehe", jetztMinuten: 10 * 60 })).erlaubt, true);

// Stumm
check("stumm heute blockiert",
  pruefe(e({ stumm_bis: HEUTE }), lage()).grund, `stumm bis ${HEUTE}`);
check("stumm bis gestern blockiert nicht",
  pruefe(e({ stumm_bis: "2026-08-13" }), lage()).erlaubt, true);

// Tagesgrenze
check("unter der Grenze",
  pruefe(e({ max_pro_tag: 3 }), lage({ bereitsGesendet: 2 })).erlaubt, true);
check("auf der Grenze blockiert",
  pruefe(e({ max_pro_tag: 3 }), lage({ bereitsGesendet: 3 })).grund,
  "Tagesgrenze 3 erreicht");
check("Grenze 0 heisst ohne Grenze",
  pruefe(e({ max_pro_tag: 0 }), lage({ bereitsGesendet: 9999 })).erlaubt, true);

// Test geht an allen Filtern vorbei - ausser am Kanal-Schalter.
check("Test ignoriert Ruhezeit",
  pruefe(nachts, lage({ art: "test", jetztMinuten: 3 * 60 })).erlaubt, true);
check("Test ignoriert Stummschaltung",
  pruefe(e({ stumm_bis: HEUTE }), lage({ art: "test" })).erlaubt, true);
check("Test ignoriert Paarliste",
  pruefe(e({ paare: ["EURUSD"] }), lage({ art: "test", pair: "GBPJPY" })).erlaubt, true);
check("Test ignoriert Tagesgrenze",
  pruefe(e({ max_pro_tag: 1 }), lage({ art: "test", bereitsGesendet: 99 })).erlaubt, true);
check("Test scheitert ohne Kanal",
  pruefe(e({ push_an: false, telegram_an: false }), lage({ art: "test" })).erlaubt, false);

/* ------------------------------------------------------------- Formular */
const formular = (eintraege: Record<string, string>) =>
  ausFormular((name) => (name in eintraege ? eintraege[name] : null));

const leeresFormular = formular({});
check("nicht angehakte Checkbox ist false", leeresFormular.push_an, false);
check("fehlende Arten ergeben leere Liste", leeresFormular.arten, []);
check("leeres Zeitfeld wird null", leeresFormular.ruhe_von, null);
check("fehlende Zahl faellt auf Standard",
  leeresFormular.max_pro_tag, STANDARD_EINSTELLUNGEN.max_pro_tag);

const vollesFormular = formular({
  push_an: "on", telegram_an: "on", telegram_chat_id: " 12345 ",
  art_naehe: "on", art_hit: "on",
  paare: "eurusd, GBP/JPY;xauusd  eur",
  ruhe_von: "22:00", ruhe_bis: "07:00", ruhe_ausser_hit: "on",
  max_pro_tag: "12", stumm_bis: "2026-09-01",
});
check("Kanaele gelesen", [vollesFormular.push_an, vollesFormular.telegram_an], [true, true]);
check("Chat-ID getrimmt", vollesFormular.telegram_chat_id, "12345");
check("Arten in fester Reihenfolge", vollesFormular.arten, ["naehe", "hit"]);
check("Paare getrennt, normiert, Kurzes verworfen",
  vollesFormular.paare, ["EURUSD", "GBPJPY", "XAUUSD"]);
check("Zeiten uebernommen",
  [vollesFormular.ruhe_von, vollesFormular.ruhe_bis], ["22:00", "07:00"]);
check("Zahl gelesen", vollesFormular.max_pro_tag, 12);
check("Datum gelesen", vollesFormular.stumm_bis, "2026-09-01");
check("negative Zahl faellt auf Standard",
  formular({ max_pro_tag: "-5" }).max_pro_tag, STANDARD_EINSTELLUNGEN.max_pro_tag);
check("leere Chat-ID wird null", formular({ telegram_chat_id: "   " }).telegram_chat_id, null);
// Number(null) und Number("") sind 0 - eine 0 muss aber „keine Grenze"
// heissen und darf nicht aus einem fehlenden Feld entstehen.
check("leeres Zahlenfeld faellt auf Standard, nicht auf 0",
  formular({ max_pro_tag: "" }).max_pro_tag, STANDARD_EINSTELLUNGEN.max_pro_tag);
check("ausgeschriebene 0 bleibt 0", formular({ max_pro_tag: "0" }).max_pro_tag, 0);
check("Text als Zahl faellt auf Standard",
  formular({ max_pro_tag: "viele" }).max_pro_tag, STANDARD_EINSTELLUNGEN.max_pro_tag);

/* ------------------------------------------------------------- ausZeile */
const zeile = (p: Record<string, unknown> = {}) => ausZeile({
  push_an: true, telegram_an: false, telegram_chat_id: null,
  arten: ["naehe", "hit", "zeit"], paare: [], ruhe_von: null, ruhe_bis: null,
  ruhe_ausser_hit: true, max_pro_tag: 40, stumm_bis: null, ...p,
} as Parameters<typeof ausZeile>[0]);

check("arten null faellt auf Standard", zeile({ arten: null }).arten,
  STANDARD_EINSTELLUNGEN.arten);
check("arten leer bleibt leer", zeile({ arten: [] }).arten, []);
check("unbekannte Art wird verworfen",
  zeile({ arten: ["hit", "quatsch", "ZEIT"] }).arten, ["hit", "zeit"]);
check("Postgres-time wird gekuerzt", zeile({ ruhe_von: "22:00:00" }).ruhe_von, "22:00");
check("Zeitstempel im Datumsfeld wird gekuerzt",
  zeile({ stumm_bis: "2026-09-01T00:00:00Z" }).stumm_bis, "2026-09-01");
check("null-Kanal faellt auf Standard", zeile({ push_an: null }).push_an, true);
check("NULL-Zahl faellt auf Standard",
  zeile({ max_pro_tag: null }).max_pro_tag, STANDARD_EINSTELLUNGEN.max_pro_tag);
check("gespeicherte 0 bleibt 0 (keine Grenze)", zeile({ max_pro_tag: 0 }).max_pro_tag, 0);
check("Paare aus der DB werden normiert",
  zeile({ paare: ["eur/usd", "x"] }).paare, ["EURUSD"]);

/* ------------------------------------------------------------- zurZeile */
check("leere Ruhezeit wird null, nicht Leerstring",
  zurZeile(e({ ruhe_von: "", ruhe_bis: "" } as Partial<AlarmEinstellungen>)).ruhe_von, null);
check("leeres stumm_bis wird null",
  zurZeile(e({ stumm_bis: "" } as Partial<AlarmEinstellungen>)).stumm_bis, null);
check("gesetzte Zeit bleibt", zurZeile(e({ ruhe_von: "22:00" })).ruhe_von, "22:00");
check("Hin und zurueck aendert nichts",
  ausZeile(zurZeile(e({ ruhe_von: "22:00", ruhe_bis: "07:00", paare: ["EURUSD"] }))),
  e({ ruhe_von: "22:00", ruhe_bis: "07:00", paare: ["EURUSD"] }));
check("fehlende Tabelle wird am Postgres-Code erkannt",
  istTabelleFehlt("42P01", "relation \"alarm_einstellungen\" does not exist"), true);
check("fehlende Tabelle wird am PostgREST-Code erkannt",
  istTabelleFehlt("PGRST205", "Could not find the table"), true);
check("anderer Fehler ist kein Tabellenfehler",
  istTabelleFehlt("23505", "duplicate key value"), false);

/* ------------------------------------------------------------- Warnungen */
check("kein Kanal wird gewarnt",
  warnungen(e({ push_an: false, telegram_an: false }))[0],
  "Beide Kanäle sind aus — es geht gar nichts raus.");
check("keine Art wird gewarnt",
  warnungen(e({ arten: [] })).some((w) => w.includes("Keine Alarmart")), true);
check("halbe Ruhezeit wird gewarnt",
  warnungen(e({ ruhe_von: "22:00" })).some((w) => w.includes("beide Zeiten")), true);
check("gleiche Ruhezeiten werden gewarnt",
  warnungen(e({ ruhe_von: "22:00", ruhe_bis: "22:00" })).some((w) => w.includes("unwirksam")), true);
check("saubere Einstellung warnt nicht", warnungen(e()), []);

/* ------------------------------------------------------------- Telegram-Text */
check("HTML maskiert genau drei Zeichen",
  escapeHtml(`a&b<c>d"e'f`), `a&amp;b&lt;c&gt;d"e'f`);
check("Telegram-Text mit Link",
  baueTelegramText({ art: "hit", titel: "EURUSD — GVA erreicht", text: "Preis 1.09 <hier>" },
    "https://kerimos.vercel.app"),
  "🚨 <b>EURUSD — GVA erreicht</b>\nPreis 1.09 &lt;hier&gt;\n\n"
  + '<a href="https://kerimos.vercel.app/trading">In KerimOS öffnen</a>');
check("ohne Basis-URL kein Link",
  baueTelegramText({ art: "zeit", titel: "T", text: "B" }, null),
  "⏰ <b>T</b>\nB");
check("eigene URL wird benutzt",
  baueTelegramText({ art: "test", titel: "T", text: "B", url: "/trading/alarme" }, "https://x.dev"),
  '🧪 <b>T</b>\nB\n\n<a href="https://x.dev/trading/alarme">In KerimOS öffnen</a>');
check("URL ohne Schraegstrich wird ergaenzt",
  baueTelegramText({ art: "test", titel: "T", text: "B", url: "trading" }, "https://x.dev")
    .includes("https://x.dev/trading"), true);

/* ------------------------------------------------------------- Zusammenfassung */
const versand = (p: Partial<VersandErgebnis> = {}): VersandErgebnis => ({
  unterdrueckt: null,
  push: { versucht: false, gesendet: 0, entfernt: 0, fehler: [] },
  telegram: { versucht: false, ok: false, fehler: null },
  zeile: "", ...p,
});
const meldung = { art: "hit" as const, titel: "t", text: "b", pair: "EURUSD" };

check("beide Kanaele erfolgreich",
  fasseZusammen(meldung, versand({
    push: { versucht: true, gesendet: 2, entfernt: 0, fehler: [] },
    telegram: { versucht: true, ok: true, fehler: null },
  })),
  "EURUSD hit: Push an 2 Gerät(e) · Telegram ok");
check("Push leer wird benannt",
  fasseZusammen(meldung, versand({
    push: { versucht: true, gesendet: 0, entfernt: 0, fehler: [] },
  })),
  "EURUSD hit: Push nichts (kein Gerät angemeldet)");
check("unterdrueckt gewinnt",
  fasseZusammen(meldung, versand({ unterdrueckt: "Ruhezeit 22:00–07:00" })),
  "EURUSD: nicht gesendet (Ruhezeit 22:00–07:00)");
check("Telegram allein zaehlt als angekommen",
  irgendwoAngekommen(versand({ telegram: { versucht: true, ok: true, fehler: null } })), true);
check("nichts angekommen",
  irgendwoAngekommen(versand({
    push: { versucht: true, gesendet: 0, entfernt: 0, fehler: ["x"] },
    telegram: { versucht: true, ok: false, fehler: "y" },
  })), false);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
