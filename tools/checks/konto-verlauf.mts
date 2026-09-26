// Kontrollwerte für die Kontokette.
// Aufruf:  npx -y tsx tools/checks/konto-verlauf.mts
//
// Der wichtigste Test steht am Schluss: Wird der Gewinn eines ALTEN Trades
// korrigiert, müssen sich der Kontostand von heute, der Stand vor jedem
// späteren Trade und damit dessen Risiko und R mitverschieben. Genau das
// fehlte vorher, und genau deshalb blieb das R beim Bearbeiten stehen.
import {
  baueVerlauf, rechneR, monatsStartVon,
  type VerlaufTrade, type VerlaufBuchung, type VerlaufKonto,
} from "../../src/lib/trading/konto-verlauf";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`
    + `${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const konto: VerlaufKonto = {
  id: "k1", type: "ek", name: "Vantage", currency: "CHF",
  initialBalance: 10000, currentBalance: 10000,
};

const trade = (o: Partial<VerlaufTrade> & { id: string; date: string }): VerlaufTrade => ({
  type: "ek", sessionType: "live", createdAt: `${o.date}T10:00:00Z`, status: "closed",
  result: null, profitAmount: null, profitPercent: null,
  riskAmount: null, riskPercent: null, rMultiple: 0, ...o,
});

/* ------------------------------------------------------------- Grundfälle */

{
  // Gewinn in Prozent: 2 % von 10'000 = 200, Stand danach 10'200.
  const t1 = trade({ id: "t1", date: "2026-09-01", result: "win", profitPercent: 2, riskPercent: 1 });
  const v = baueVerlauf([konto], [], [t1], "2026-09-01");
  const r1 = v.proTrade.get("t1")!;
  check("Prozent → Betrag", r1.gewinn, 200);
  check("Risiko 1 % von 10000", r1.risiko, 100);
  check("R = 200 / 100", r1.r, 2);
  check("Stand nach dem Trade", v.proTyp.get("ek")!.stand, 10200);
}

{
  // Betrag in Franken schlägt Prozent, und ein Verlust ergibt negatives R.
  const t1 = trade({ id: "t1", date: "2026-09-02", result: "loss", profitAmount: -150, riskAmount: 100 });
  const v = baueVerlauf([konto], [], [t1], "2026-09-01");
  check("Verlust-R", v.proTrade.get("t1")!.r, -1.5);
  check("Stand nach Verlust", v.proTyp.get("ek")!.stand, 9850);
}

{
  // Offener Trade bewegt kein Geld.
  const t1 = trade({ id: "t1", date: "2026-09-03", status: "open", profitAmount: 500 });
  const v = baueVerlauf([konto], [], [t1], "2026-09-01");
  check("offener Trade zählt nicht", v.proTyp.get("ek")!.stand, 10000);
  check("offene gezählt", v.proTyp.get("ek")!.offene, 1);
}

{
  // Ein- und Auszahlungen laufen in der Kette mit.
  const b: VerlaufBuchung[] = [
    { id: "b1", accountId: "k1", type: "ek", buchungsTyp: "deposit", amount: 2000, date: "2026-09-05" },
    { id: "b2", accountId: "k1", type: "ek", buchungsTyp: "withdrawal", amount: 500, date: "2026-09-06" },
  ];
  const t1 = trade({ id: "t1", date: "2026-09-07", result: "win", profitPercent: 1, riskPercent: 1 });
  const v = baueVerlauf([konto], b, [t1], "2026-09-01");
  check("Stand vor dem Trade nach Ein/Aus", v.proTrade.get("t1")!.standVor, 11500);
  check("Gewinn 1 % davon", v.proTrade.get("t1")!.gewinn, 115);
  check("Endstand", v.proTyp.get("ek")!.stand, 11615);
}

{
  // Backtest-Zeilen in der trades-Tabelle bewegen kein echtes Geld.
  const t1 = trade({ id: "t1", date: "2026-09-08", sessionType: "backtest", result: "win", profitAmount: 999 });
  const v = baueVerlauf([konto], [], [t1], "2026-09-01");
  check("Backtest zählt nicht", v.proTyp.get("ek")!.stand, 10000);
}

/* ----------------------------------------------------------------- R-Regel */

check("R ohne Risiko: gespeichert mit Vorzeichen", rechneR(null, null, "loss", 1).r, -1);
check("R ohne Risiko, Quelle", rechneR(null, null, "loss", 1).quelle, "gespeichert");
check("Breakeven ist 0 R", rechneR(50, 100, "breakeven", 3).r, 0);
check("R gerechnet", rechneR(250, 100, "win", 0), { r: 2.5, quelle: "gerechnet" });
check("Risiko 0 rechnet nicht", rechneR(250, 0, "win", 1).quelle, "gespeichert");

/* ------------------------------------- Der Test, um den es eigentlich geht */

{
  const alt = (gewinnProzent: number) => [
    trade({ id: "alt", date: "2026-09-01", result: "win", profitPercent: gewinnProzent, riskPercent: 1 }),
    trade({ id: "neu", date: "2026-09-10", result: "win", profitPercent: 1, riskPercent: 1 }),
  ];

  const vorher = baueVerlauf([konto], [], alt(10), "2026-09-01");
  check("vorher: Stand vor dem zweiten Trade", vorher.proTrade.get("neu")!.standVor, 11000);
  check("vorher: Risiko des zweiten Trades", vorher.proTrade.get("neu")!.risiko, 110);
  check("vorher: Endstand", vorher.proTyp.get("ek")!.stand, 11110);

  // Kerim korrigiert den alten Trade von +10 % auf +2 %.
  const nachher = baueVerlauf([konto], [], alt(2), "2026-09-01");
  check("nachher: Stand vor dem zweiten Trade", nachher.proTrade.get("neu")!.standVor, 10200);
  check("nachher: Risiko zieht mit", nachher.proTrade.get("neu")!.risiko, 102);
  check("nachher: Endstand von heute", nachher.proTyp.get("ek")!.stand, 10302);
  check("R bleibt bei 1, weil Risiko und Gewinn gleich skalieren",
    nachher.proTrade.get("neu")!.r, 1);
}

{
  // Monatsveränderung: was vor dem Monatsanfang lief, zählt zum Startwert.
  const t = [
    trade({ id: "a", date: "2026-08-20", result: "win", profitAmount: 500 }),
    trade({ id: "b", date: "2026-09-12", result: "loss", profitAmount: -200 }),
  ];
  const v = baueVerlauf([konto], [], t, monatsStartVon("2026-09-26"));
  const ek = v.proTyp.get("ek")!;
  check("Stand am Monatsanfang", ek.standMonatsanfang, 10500);
  check("Veränderung diesen Monat", ek.veraenderungMonat, -200);
  check("Höchststand", ek.hoechststand, 10500);
  check("Drawdown", ek.drawdown, 200);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
