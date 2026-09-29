/**
 * Die Erklärtexte für die Info-Zeichen (29.09.2026). An einer Stelle, damit
 * dieselbe Sache überall gleich erklärt wird.
 */
export const ERKLAERUNG = {
  urteil:
    "Das Urteil fasst drei Teile zusammen: Zentralbank (40 %), Wirtschaft (35 %) und Überraschungen (25 %). "
    + "Bullish heisst: die Daten sprechen dafür, dass die Währung gegen die anderen steigt. "
    + "Es ersetzt keine GVA-Linie — es sagt, in welche Richtung du sie suchen solltest.",
  gewichtung:
    "Zentralbank am stärksten, weil auf deinem Zeitrahmen der Zinspfad die Richtung bestimmt. Wirtschaft danach, weil sie die "
    + "Zentralbank treibt (PMI läuft voraus). Überraschungen am schwächsten, weil eine einzelne Abweichung nur kurz wirkt — "
    + "sie zählen, wenn sie sich wiederholen. Eine begründete Setzung, noch nicht am Journal geprüft.",
  wirtschaft:
    "Ebene 1: läuft die Wirtschaft? Kern ist der PMI — über 50 wächst die Wirtschaft, darunter schrumpft sie. "
    + "Dazu BIP und Arbeitsmarkt. Eine starke Wirtschaft erlaubt der Notenbank hohe Zinsen und stützt die Währung.",
  zentralbank:
    "Ebene 2: was macht die Notenbank? Straffung (Zinsen steigen) oder Pause oben stützen die Währung, "
    + "Lockerung oder Pause unten belasten sie. Dazu: was der Markt für die nächsten Schritte einpreist.",
  ueberraschung:
    "Wie die Daten gegen die Erwartung ausfallen. Besser als erwartet heisst: der Markt muss die Währung "
    + "höher bewerten, als er dachte — daraus entstehen Bewegungen. Gerechnet über Wachstum, Inflation und Arbeitsmarkt, "
    + "jüngere und wichtige Termine zählen mehr (Halbwertszeit 30 Tage).",
  regime:
    "Risk-on: Anleger kaufen Risiko (Aktien steigen, Volatilität tief). Dann steigen die Rohstoff- und Hochzinswährungen "
    + "AUD, NZD, CAD, während die sicheren Häfen JPY und CHF verlieren. Risk-off ist das Gegenteil: Flucht in JPY, CHF "
    + "und oft USD. Gemessen an VIX, S&P 500 und Kupfer/Gold. Wird angezeigt, geht aber nicht ins Urteil ein.",
  inflation:
    "Höhere Inflation als erwartet zwingt die Notenbank eher zu höheren Zinsen — das stützt die Währung. "
    + "Die Kerninflation (ohne Energie und Nahrung) zählt für die Notenbank meist mehr.",
  grosse:
    "Termine mit hohem oder mittlerem Impact, bei denen das Ist klar neben der Erwartung lag (mindestens 1.5 typische "
    + "Schritte). Solche Überraschungen verschieben die Erwartungen des Marktes — daraus entstehen die Bewegungen.",
  cot:
    "Commitments of Traders: wie die grossen Fonds am Terminmarkt positioniert sind. Extreme (sehr long oder sehr short) "
    + "sind eher ein Warnzeichen als eine Bestätigung. Nur Anzeige.",
} as const;
