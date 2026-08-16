// Kontrollwerte für den Aktivitätsbonus.
// Aufruf:  npx -y tsx tools/checks/essen-bonus.mts
import {
  angerechnet, baueBudget, bonusSatz, PAUSCHALE, STANDARD_FAKTOR,
  type BonusEintrag,
} from "../../src/lib/essen-bonus";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const e = (p: Partial<BonusEintrag> = {}): BonusEintrag => ({
  datum: "2026-08-16", art: "lauf", verbrannt: null, notiz: null, ...p,
});

// Der Fall aus dem Gespraech: 800 verbrannt, 75 % angerechnet = 600.
check("800 verbrannt ergeben 600", angerechnet(e({ verbrannt: 800 })), 600);
check("Standardfaktor", STANDARD_FAKTOR, 75);
check("Gym ohne Zahl nimmt die Pauschale",
  angerechnet(e({ art: "gym" })), Math.round(PAUSCHALE.gym! * 0.75 / 10) * 10);
check("Laufen ohne Zahl ergibt nichts", angerechnet(e({ art: "lauf" })), 0);
check("negative Zahl ergibt nichts", angerechnet(e({ verbrannt: -100 })), 0);
check("null Kalorien ergeben nichts", angerechnet(e({ verbrannt: 0 })), 0);
check("auf zehn gerundet", angerechnet(e({ verbrannt: 333 })), 250);
check("Faktor 100 rechnet voll an", angerechnet(e({ verbrannt: 800 }), 100), 800);
check("Faktor 0 rechnet nichts an", angerechnet(e({ verbrannt: 800 }), 0), 0);
check("unsinniger Faktor wird gedeckelt", angerechnet(e({ verbrannt: 800 }), 999), 1200);
check("kaputter Faktor faellt auf den Standard",
  angerechnet(e({ verbrannt: 800 }), NaN), 600);

const leer = baueBudget(2000, []);
check("ohne Aktivitaet bleibt das Ziel", [leer.grund, leer.bonus, leer.gesamt], [2000, 0, 2000]);
check("und es gibt nichts zu sagen", bonusSatz(leer), null);

const mitLauf = baueBudget(2000, [e({ verbrannt: 800 })]);
check("Budget mit Lauf", [mitLauf.bonus, mitLauf.gesamt, mitLauf.verbrannt], [600, 2600, 800]);
check("Satz nennt beide Zahlen",
  bonusSatz(mitLauf), "Laufen: 800 verbrannt, davon 75 % angerechnet — heute 2600 statt 2000 kcal.");

const zwei = baueBudget(2000, [e({ verbrannt: 800 }), e({ art: "gym" })]);
check("zwei Eintraege addieren sich", zwei.bonus, 600 + 230);
check("Arten werden zusammengefasst", bonusSatz(zwei)?.startsWith("Laufen + Krafttraining"), true);

const doppelt = baueBudget(2000, [e({ verbrannt: 400 }), e({ verbrannt: 400 })]);
check("gleiche Art nur einmal genannt",
  bonusSatz(doppelt)?.startsWith("Laufen:"), true);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
