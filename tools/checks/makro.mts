// Kontrollwerte für die fundamentale Bewertung (drei Ebenen).
// Aufruf:  npx -y tsx tools/checks/makro.mts
//
// Der wichtigste Test steht unten: eine Ebene ohne Daten darf das Gesamturteil
// NICHT Richtung null ziehen. Sonst sähe eine Währung, über die man nichts
// weiss, neutral aus — und neutral ist eine Aussage, „unbekannt" ist keine.
import type { Eingabe, Umfeld } from "../../src/lib/makro/bewertung";

const { bewerteWaehrung, rangliste, paarIdeen, paarUrteil } =
  await import("../../src/lib/makro/bewertung.ts");
const { montyAbgleich } = await import("../../src/lib/makro/monty-abgleich.ts");

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

/**
 * Ein Teil wird über seinen Schlüssel geholt, nie über die Position.
 * Am 26.09.2026 kam der OECD-Frühindikator an den Anfang von Ebene 1 — und
 * zwei Tests, die `teile[0]` lasen, prüften ab da die falsche Zahl.
 */
const teil = (b: ReturnType<typeof bewerteWaehrung>, n: 1 | 2 | 3, key: string) =>
  ebene(b, n).teile.find((t) => t.key === key)!;

/* ------------------------------------------------------------- Ebene 1 */

{
  const b = bewerteWaehrung(basis({ hand: { pmi_industrie: hand(55) } }), umfeld);
  check("PMI 55 → +1", teil(b, 1, "pmi_industrie").score, 1);
  check("nur ein Teil belegt", ebene(b, 1).belegt, 1);
}
{
  const b = bewerteWaehrung(basis({ hand: { pmi_industrie: hand(47.5) } }), umfeld);
  check("PMI 47.5 → −0.5", teil(b, 1, "pmi_industrie").score, -0.5);
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
  // Seit 03.10.2026 zählt nur die Wirtschaft. Nur Zentralbank-Daten → kein
  // Urteil (unbekannt), nicht „neutral".
  const b = bewerteWaehrung(basis({ leitzins: 3.5, leitzins6M: 0.5 }), umfeld);
  check("nur Zentralbank-Daten → kein Urteil", b.gesamt, null);
  check("Zentralbank-Ebene wird trotzdem gerechnet", ebene(b, 2).score !== null, true);
  check("Wirtschaft allein trägt das Urteil",
    bewerteWaehrung(basis({ hand: { pmi_industrie: hand(55) } }), umfeld).gesamt, 1);
  check("Abdeckung zeigt die Lücke (1 von 6 gewerteten Teilen)", Math.round(b.abdeckung * 100), 17);
  check("Zinsniveau allein zählt nicht mehr",
    bewerteWaehrung(basis({ leitzins: 0 }), umfeld).gesamt, null);
}
{
  // Seit 03.10.2026: Wirtschaft 100 %, Zentralbank nur Anzeige.
  const b = bewerteWaehrung(basis({
    hand: { pmi_industrie: hand(60), pmi_dienste: hand(60), bip_yoy: hand(3),
            arbeitslos: hand(4, 4.5), handelsbilanz: hand(8) },
    leitzins: 0.5, leitzins6M: -0.5, erwartung: -0.5, realzins: -1, zyklus: "lockerung",
  }), umfeld);
  check("starke Wirtschaft, lockernde Notenbank → Wirtschaft entscheidet",
    [b.gesamt, (b.gesamt ?? 0) > 0.5], [ebene(b, 1).score, true]);
  check("Sentiment zählt nicht", ebene(b, 3).score, null);
}

/* ------------------------------------------------------- Zinsschritte */
{
  const { zinsSchritteAus, zyklusAus } = await import("../../src/lib/makro/bewertung.ts");
  const reihe = [
    { datum: "2025-01-01", wert: 4 }, { datum: "2025-03-01", wert: 3.75 },
    { datum: "2025-06-01", wert: 3.75 }, { datum: "2026-06-01", wert: 3.5 },
  ];
  const schritte = zinsSchritteAus(reihe);
  check("Zinsschritte", schritte.map((x) => x.bps), [-25, -25]);
  check("Zyklus: Senkung vor 4 Monaten → Lockerung", zyklusAus(schritte, new Date("2026-09-26")), "lockerung");
  check("Zyklus: Senkung vor 9 Monaten → Pause unten", zyklusAus(schritte, new Date("2027-03-01")), "pause_unten");
  check("Zyklus: keine Schritte → unbekannt", zyklusAus([]), null);
}

/* --------------------------------------------------------- Paar-Ideen */

{
  const zeilen = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", hand: { pmi_industrie: hand(55) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "JPY", hand: { pmi_industrie: hand(45.25) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
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
    bewerteWaehrung(basis({ ccy: "USD", hand: { pmi_industrie: hand(50.125) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
  ]);
  check("kein Abstand, keine Idee", paarIdeen(zeilen, ["EURUSD"]).length, 0);
}

/* ------------------------------------------- Urteil zu einem einzelnen Paar */

{
  // Dieselbe Rangliste wie oben: USD stark, JPY schwach, EUR dazwischen.
  const zeilen = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", hand: { pmi_industrie: hand(55) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "JPY", hand: { pmi_industrie: hand(45.25) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
  ]);

  check("USDJPY long wird bestätigt", paarUrteil(zeilen, "USDJPY", "long").urteil, "bestaetigt");
  check("USDJPY short spricht dagegen", paarUrteil(zeilen, "USDJPY", "short").urteil, "dagegen");
  check("Abstand ist Basis minus Quote",
    paarUrteil(zeilen, "USDJPY", "long").abstand,
    Number(((zeilen[0].gesamt ?? 0) - (zeilen[2].gesamt ?? 0)).toFixed(2)));
  check("gedreht kehrt sich das Vorzeichen um",
    paarUrteil(zeilen, "JPYUSD", "long").abstand,
    -(paarUrteil(zeilen, "USDJPY", "long").abstand ?? 0));

  // Der wichtigste Fall: unter der Schwelle ist es KEIN Gegenwind, sondern
  // schlicht keine Aussage. „dagegen" wäre hier ein erfundener Widerspruch.
  const eng = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", hand: { pmi_industrie: hand(50.125) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
  ]);
  check("zu enger Abstand → neutral", paarUrteil(eng, "EURUSD", "long").urteil, "neutral");
  check("und die Ebenen legen nichts nahe", paarUrteil(eng, "EURUSD", "long").ebenenSeite, "neutral");

  // Eine Währung ohne jedes Datum darf nicht als „neutral" durchgehen.
  check("unbekannte Währung → unbekannt",
    paarUrteil(zeilen, "USDCHF", "long").urteil, "unbekannt");
  check("und ohne Abstand", paarUrteil(zeilen, "USDCHF", "long").abstand, null);
}

/* ------------------------------------------------- Monty als Gegenprobe */

{
  const zeilen = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", hand: { pmi_industrie: hand(55) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "JPY", hand: { pmi_industrie: hand(45.25) } }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
  ]);
  const cot = (ccy: string, divergenz: -1 | 0 | 1, komm = 80, retail = 20) =>
    ({ ccy, kommRang: komm, retailRang: retail, divergenz });

  const a = montyAbgleich(zeilen, [
    cot("USD", 1),            // Ebenen stark, Commercials dafür  → einig
    cot("JPY", 1),            // Ebenen schwach, Commercials dafür → uneinig
    cot("EUR", 0, 50, 50),    // keine Streckung                   → still
  ]);
  const stand = (ccy: string) => a.zeilen.find((z) => z.ccy === ccy)!.stand;
  check("stark + Commercials dafür → einig", stand("USD"), "einig");
  check("schwach + Commercials dafür → uneinig", stand("JPY"), "uneinig");
  check("keine Streckung → still", stand("EUR"), "still");
  check("gezählt wird nur, wozu Monty etwas sagt", [a.einig, a.uneinig, a.beurteilt], [1, 1, 2]);

  // Fehlende Historie ist nicht dasselbe wie „neutral" — sonst sähe eine
  // Datenlücke aus wie ein Ergebnis.
  const b2 = montyAbgleich(zeilen, [{ ccy: "USD", kommRang: null, retailRang: null, divergenz: 0 }]);
  check("ohne COT-Reihe → offen", b2.zeilen.find((z) => z.ccy === "USD")!.stand, "offen");
  check("offene Zeilen zählen nicht mit", b2.beurteilt, 0);

  // Eine Währung im Mittelfeld kann Monty weder stützen noch widersprechen.
  const eng = rangliste([
    bewerteWaehrung(basis({ ccy: "USD", leitzins6M: 0.012 }), umfeld),
    bewerteWaehrung(basis({ ccy: "EUR", hand: { pmi_industrie: hand(50) } }), umfeld),
  ]);
  const c = montyAbgleich(eng, [cot("USD", 1), cot("EUR", -1, 20, 80)]);
  check("Mittelfeld → still, egal was COT sagt",
    c.zeilen.map((z) => z.stand), ["still", "still"]);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte stimmen." : `\n${fails} Abweichung(en).`);
process.exit(fails === 0 ? 0 : 1);
