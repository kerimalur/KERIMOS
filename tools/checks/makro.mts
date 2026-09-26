// Kontrollwerte für die fundamentale Bewertung (drei Ebenen).
// Aufruf:  npx -y tsx tools/checks/makro.mts
//
// Der wichtigste Test steht unten: eine Ebene ohne Daten darf das Gesamturteil
// NICHT Richtung null ziehen. Sonst sähe eine Währung, über die man nichts
// weiss, neutral aus — und neutral ist eine Aussage, „unbekannt" ist keine.
import type { Eingabe, Umfeld } from "../../src/lib/makro/bewertung";

const { bewerteWaehrung, rangliste, paarIdeen } =
  await import("../../src/lib/makro/bewertung.ts");

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`
    + `${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const umfeld: Umfeld = { zinsSchnitt: 2, realSchnitt: 0.5, regime: 1 };

const basis = (o: Partial<Eingabe> = {}): Eingabe => ({
  ccy: "USD", hand: {}, zyklus: null,
  leitzins: null, leitzins6M: null, inflation: null, realzins: null,
  zweiJahr: null, erwartung: null, cotRang: null, risikoBeta: 0,
  ereignisse: [], ...o,
});

const hand = (wert: number, vorwert: number | null = null) =>
  ({ wert, vorwert, stand: "2026-09-01", quelle: "Trading Economics" });

const ebene = (b: ReturnType<typeof bewerteWaehrung>, n: 1 | 2 | 3) =>
  b.ebenen.find((e) => e.ebene === n)!;

/* ------------------------------------------------------------- Ebene 1 */

{
  const b = bewerteWaehrung(basis({ hand: { pmi_industrie: hand(55) } }), umfeld);
  check("PMI 55 → +1", ebene(b, 1).teile[0].score, 1);
  check("nur ein Teil belegt", ebene(b, 1).belegt, 1);
}
{
  const b = bewerteWaehrung(basis({ hand: { pmi_industrie: hand(47.5) } }), umfeld);
  check("PMI 47.5 → −0.5", ebene(b, 1).teile[0].score, -0.5);
}
{
  // Arbeitslosenquote: die Richtung zählt, nicht das Niveau.
  const steigt = bewerteWaehrung(basis({ hand: { arbeitslos: hand(4.2, 4.0) } }), umfeld);
  const faellt = bewerteWaehrung(basis({ hand: { arbeitslos: hand(7.8, 8.1) } }), umfeld);
  const zeile = (b: ReturnType<typeof bewerteWaehrung>) =>
    ebene(b, 1).teile.find((t) => t.key === "arbeitslos")!.score;
  check("Quote steigt um 0.2 → negativ", zeile(steigt), -0.67);
  check("Quote fällt, obwohl hoch → positiv", zeile(faellt), 1);
}

/* ------------------------------------------------------------- Ebene 2 */

{
  const b = bewerteWaehrung(basis({
    leitzins: 3.5, leitzins6M: 0.25, erwartung: 0.5, realzins: 1.0, zyklus: "straffung",
  }), umfeld);
  const t = (k: string) => ebene(b, 2).teile.find((x) => x.key === k)!.score;
  check("Zins 3.5 gegen Schnitt 2 → +1", t("zinsniveau"), 1);
  check("+0.25 pp in 6 Monaten → +0.5", t("richtung"), 0.5);
  check("Markt preist +0.5 pp → +1", t("erwartung"), 1);
  check("Realzins 0.5 über Schnitt → +0.33", t("realzins"), 0.33);
  check("Straffung → +1", t("zyklus"), 1);
}

/* ------------------------------------------------------------- Ebene 3 */

{
  // Risk-on trifft einen sicheren Hafen negativ.
  const chf = bewerteWaehrung(basis({ ccy: "CHF", risikoBeta: -0.9 }), umfeld);
  const aud = bewerteWaehrung(basis({ ccy: "AUD", risikoBeta: 1 }), umfeld);
  check("Risk-on × Hafen-Beta → negativ", ebene(chf, 3).teile[0].score, -0.9);
  check("Risk-on × Risiko-Beta → positiv", ebene(aud, 3).teile[0].score, 1);
}
{
  const b = bewerteWaehrung(basis({
    ereignisse: [{ titel: "Zollstreit", richtung: -1 }, { titel: "Wahl", richtung: -1 }],
  }), umfeld);
  check("zwei negative Ereignisse → −1",
    ebene(b, 3).teile.find((t) => t.key === "ereignisse")!.score, -1);
}

/* ------------------------------------------------------ Das Gesamturteil */

{
  // Nur Ebene 2 hat Daten: das Urteil ist ihres, nicht ein Drittel davon.
  const b = bewerteWaehrung(basis({ leitzins: 3.5 }), umfeld);
  check("eine Ebene mit Daten trägt das Urteil allein", b.gesamt, 1);
  check("Abdeckung zeigt die Lücke", Math.round(b.abdeckung * 100), 7);
}
{
  // Gewichtet: Wirtschaft +1 (0.35), Zentralbank −1 (0.45) → (0.35−0.45)/0.8
  const b = bewerteWaehrung(basis({
    hand: { pmi_industrie: hand(60), pmi_dienste: hand(60), bip_yoy: hand(3),
            arbeitslos: hand(4, 4.5), handelsbilanz: hand(8) },
    leitzins: 0.5, leitzins6M: -0.5, erwartung: -0.5, realzins: -1, zyklus: "lockerung",
  }), umfeld);
  check("starke Wirtschaft, lockernde Notenbank → leicht negativ", b.gesamt, -0.13);
}

/* --------------------------------------------------------- Paar-Ideen */

{
  const zeilen = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", leitzins: 4 }), umfeld),
    bewerteWaehrung(basis({ ccy: "JPY", leitzins: 0.1 }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", leitzins: 2 }), umfeld),
  ]);
  check("Rangfolge", zeilen.map((z) => z.ccy), ["USD", "EUR", "JPY"]);

  const ideen = paarIdeen(zeilen, ["USDJPY", "EURUSD", "EURJPY"]);
  check("stärkste gegen schwächste zuerst", ideen[0].paar, "USDJPY");
  check("Richtung", ideen[0].seite, "Long");
  check("EURUSD wird zum Short auf EUR-Schwäche gedreht",
    ideen.find((i) => i.paar === "EURUSD")?.seite, "Short");
}
{
  // Zwei mittelmässige Währungen ergeben keine Idee.
  const zeilen = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", leitzins: 2.1 }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", leitzins: 2.0 }), umfeld),
  ]);
  check("kein Abstand, keine Idee", paarIdeen(zeilen, ["EURUSD"]).length, 0);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
