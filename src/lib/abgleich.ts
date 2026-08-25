/**
 * Der Abgleich: was du dir vorgenommen hast, gegen das, was daraus wurde.
 *
 * Vorher fragte der Tagesrückblick „Was habe ich erreicht?". Diese Frage
 * bekommt immer eine Antwort — man findet abends irgendetwas, das nach Ertrag
 * aussieht. Sie prüft nichts. Der Abgleich stellt stattdessen die Zeilen von
 * gestern Abend hin und fragt zu jeder einzeln nach. Das ist unangenehmer und
 * genau deshalb der Punkt.
 *
 * Drei Antworten sind möglich, mehr nicht:
 *   erledigt    - Haken dran.
 *   nicht       - mit Grund. Ohne Grund ist es keine Antwort, sondern eine Lücke.
 *   verschoben  - die Zeile wandert in den Vorsatz für morgen und kommt wieder.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/abgleich.mts`.
 */
import { zuPunkten } from "@/lib/heute-punkte";

export type Stand = "offen" | "erledigt" | "nicht" | "verschoben";

/**
 * Marker im Grund-Feld für „verschoben".
 *
 * Bewusst im selben Feld statt in einer eigenen Spalte: verschoben und
 * „nicht, weil …" schliessen sich aus, und zwei Spalten, die sich
 * ausschliessen, geraten früher oder später beide gefüllt in die Datenbank.
 */
export const VERSCHOBEN = " verschoben";

export interface AbgleichPunkt {
  zeile: string;
  stand: Stand;
  /** Nur bei `nicht` gefüllt. */
  grund: string;
}

export function baueAbgleich(
  vorsatz: string,
  erledigt: readonly string[],
  gruende: Readonly<Record<string, string>>,
): AbgleichPunkt[] {
  const fertig = new Set(erledigt);

  return zuPunkten(vorsatz).map((zeile) => {
    // Reihenfolge ist Absicht: ein Haken schlägt jeden Grund. Wer eine Zeile
    // erst verschiebt und sie dann doch macht, meint das Erledigte.
    if (fertig.has(zeile)) return { zeile, stand: "erledigt" as const, grund: "" };

    const g = gruende[zeile];
    if (g === VERSCHOBEN) return { zeile, stand: "verschoben" as const, grund: "" };
    if (g && g.trim()) return { zeile, stand: "nicht" as const, grund: g.trim() };
    return { zeile, stand: "offen" as const, grund: "" };
  });
}

export interface AbgleichStand {
  gesamt: number;
  erledigt: number;
  nicht: number;
  verschoben: number;
  offen: number;
  /** True, wenn zu jeder Zeile etwas gesagt wurde. */
  vollstaendig: boolean;
}

export function abgleichStand(punkte: readonly AbgleichPunkt[]): AbgleichStand {
  const zaehle = (s: Stand) => punkte.filter((p) => p.stand === s).length;
  const offen = zaehle("offen");
  return {
    gesamt: punkte.length,
    erledigt: zaehle("erledigt"),
    nicht: zaehle("nicht"),
    verschoben: zaehle("verschoben"),
    offen,
    vollstaendig: punkte.length > 0 && offen === 0,
  };
}

export const STAND_LABEL: Record<Stand, string> = {
  offen: "noch offen",
  erledigt: "erledigt",
  nicht: "nicht geschafft",
  verschoben: "auf morgen geschoben",
};

/**
 * Eine Zeile an einen bestehenden Vorsatz anhängen — für „auf morgen schieben".
 *
 * Steht sie schon drin, bleibt der Text unverändert. Sonst stünde dieselbe
 * Absicht zweimal da, und der Haken hinge an beiden Zeilen gleichzeitig
 * (`zuPunkten` fasst Doppelte zusammen).
 */
export function haengeAn(vorsatz: string, zeile: string): string {
  const sauber = zeile.trim();
  if (!sauber) return vorsatz;
  if (zuPunkten(vorsatz).includes(sauber)) return vorsatz;
  return vorsatz.trim() ? `${vorsatz.trim()}\n${sauber}` : sauber;
}
