// Kontrollwerte für Routinen-Erinnerungen, Wochenziele und den Spruch des Tages.
// Aufruf:  npx -y tsx tools/checks/routinen.mts
import type { Handlung } from "../../src/lib/routinen/typen";

const { faelligeErinnerungen, heuteFaellig, proWoche, minutenAus, zusatz, nochOffen } =
  await import("../../src/lib/routinen/typen.ts");
const { kalenderwoche, naechsterStatus, sortiere } = await import("../../src/lib/wochenziele/typen.ts");
const { spruchFuer, SPRUECHE } = await import("../../src/lib/start/sprueche.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`
    + `${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const h = (o: Partial<Handlung>): Handlung => ({
  id: "x", ziel_id: "z", titel: "Gym", tage: [1, 3, 5], uhrzeit: null,
  zuletzt_erinnert: null, reihenfolge: 0, pro_woche: null, erledigt: [], ...o,
});

const mo = { datum: "2026-09-28", wochentag: 1 };

check("Uhrzeit: genau zur Zeit fällig",
  faelligeErinnerungen([h({ uhrzeit: "17:00" })], { ...mo, minuten: 17 * 60 }).einzeln.length, 1);
check("Uhrzeit: vorher nicht",
  faelligeErinnerungen([h({ uhrzeit: "17:00" })], { ...mo, minuten: 16 * 60 + 59 }).einzeln.length, 0);
check("Uhrzeit: 89 min später noch nachgeholt",
  faelligeErinnerungen([h({ uhrzeit: "17:00" })], { ...mo, minuten: 18 * 60 + 29 }).einzeln.length, 1);
check("Uhrzeit: 90 min später nicht mehr",
  faelligeErinnerungen([h({ uhrzeit: "17:00" })], { ...mo, minuten: 18 * 60 + 30 }).einzeln.length, 0);
check("heute schon erinnert → nichts",
  faelligeErinnerungen([h({ uhrzeit: "17:00", zuletzt_erinnert: "2026-09-28" })], { ...mo, minuten: 17 * 60 }).einzeln.length, 0);
check("falscher Wochentag → nichts",
  faelligeErinnerungen([h({ uhrzeit: "17:00" })], { datum: "2026-09-29", wochentag: 2, minuten: 17 * 60 }).einzeln.length, 0);
check("ohne Uhrzeit: Sammelmeldung um 07:00",
  faelligeErinnerungen([h({}), h({ id: "y", titel: "Essen" })], { ...mo, minuten: 7 * 60 + 5 }).sammel.length, 2);
check("ohne Uhrzeit: nicht um 12:00",
  faelligeErinnerungen([h({})], { ...mo, minuten: 12 * 60 }).sammel.length, 0);
check("mit Uhrzeit landet nie in der Sammelmeldung",
  faelligeErinnerungen([h({ uhrzeit: "07:00" })], { ...mo, minuten: 7 * 60 }).sammel.length, 0);
check("minutenAus 07:30:00", minutenAus("07:30:00"), 450);
check("pro Woche zählt Tage aller Handlungen",
  proWoche({ id: "z", titel: "Fit", notiz: "", reihenfolge: 0,
    handlungen: [h({}), h({ tage: [0, 1, 2, 3, 4, 5, 6] })] }), 10);
check("heute fällig: Ziel ohne heutige Handlung fällt weg",
  heuteFaellig([{ id: "z", titel: "Fit", notiz: "", reihenfolge: 0, handlungen: [h({ tage: [2] })] }], 1, "2026-09-28").length, 0);

// x-mal pro Woche
const gym = (o: Partial<Handlung> = {}) => h({ id: "gym", titel: "Gym", tage: [], pro_woche: 3, uhrzeit: "17:00", ...o });
check("3×: an jedem Tag fällig, solange offen",
  faelligeErinnerungen([gym({ erledigt: ["2026-09-28"] })], { datum: "2026-09-29", wochentag: 2, minuten: 17 * 60 }).einzeln.length, 1);
check("3×: heute schon abgehakt → keine Erinnerung",
  faelligeErinnerungen([gym({ erledigt: ["2026-09-29"] })], { datum: "2026-09-29", wochentag: 2, minuten: 17 * 60 }).einzeln.length, 0);
check("3×: Anzahl erreicht → keine Erinnerung",
  faelligeErinnerungen([gym({ erledigt: ["2026-09-28", "2026-09-29", "2026-09-30"] })], { datum: "2026-10-01", wochentag: 4, minuten: 17 * 60 }).einzeln.length, 0);
check("feste Tage: abgehakt → keine Erinnerung",
  faelligeErinnerungen([h({ uhrzeit: "17:00", erledigt: ["2026-09-28"] })], { ...mo, minuten: 17 * 60 }).einzeln.length, 0);
check("Zusatz", [zusatz(gym({ erledigt: ["2026-09-28"] })), zusatz(gym({ erledigt: ["a", "b", "c"] })), zusatz(h({}))],
  ["noch 2× diese Woche", "3× geschafft", null]);
check("pro Woche zählt die Anzahl", proWoche({ id: "z", titel: "Fit", notiz: "", reihenfolge: 0, handlungen: [gym(), h({})] }), 6);
check("noch offen nie negativ", nochOffen(gym({ erledigt: ["a", "b", "c", "d"] })), 0);
check("3× mit heute abgehakt bleibt in der Heute-Liste sichtbar",
  heuteFaellig([{ id: "z", titel: "Fit", notiz: "", reihenfolge: 0, handlungen: [gym({ erledigt: ["a", "b", "2026-09-29"] })] }], 2, "2026-09-29").length, 1);

check("KW 2026-09-21", kalenderwoche("2026-09-21"), 39);
check("KW 2026-01-01 (Donnerstag)", kalenderwoche("2026-01-01"), 1);
check("KW 2027-01-01 (Freitag) gehört zu KW 53", kalenderwoche("2027-01-01"), 53);
check("Status-Kreis", [naechsterStatus("offen"), naechsterStatus("angefangen"), naechsterStatus("fertig")],
  ["angefangen", "fertig", "offen"]);
check("dringend zuerst",
  sortiere([
    { id: "a", woche: "", titel: "a", details: "", status: "offen", dringend: false, seit: null, reihenfolge: 1, erstellt: "1" },
    { id: "b", woche: "", titel: "b", details: "", status: "offen", dringend: true, seit: null, reihenfolge: 2, erstellt: "2" },
  ]).map((z) => z.id), ["b", "a"]);

check("Spruch: derselbe Tag, derselbe Satz", spruchFuer("2026-09-26") === spruchFuer("2026-09-26"), true);
check("Spruch: nächster Tag, anderer Satz", spruchFuer("2026-09-26") !== spruchFuer("2026-09-27"), true);
check("Spruch: Liste läuft ganz durch",
  new Set(Array.from({ length: SPRUECHE.length }, (_, i) =>
    spruchFuer(`2026-10-${String(i + 1).padStart(2, "0")}`))).size, SPRUECHE.length);

if (fails > 0) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log("\nalles OK");
