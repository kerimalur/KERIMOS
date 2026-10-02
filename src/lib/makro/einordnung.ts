/**
 * Einordnung einer Kalenderzahl mit Kerims Regeln aus dem Makro-Lernen
 * (01.10.2026, Modul 0). Reine Logik, ohne Datenbank — Seiten und
 * Selbsttest (tools/checks/einordnung.mts) rechnen mit denselben Funktionen.
 *
 * Die Regeln, die hier stecken:
 *   1. Ein Paar hat zwei Seiten → jede Zahl gehört zu EINER Währung, die
 *      andere Seite wird als Warnung genannt.
 *   2. Die Kette: Zahl → Erwartung an die Notenbank → erwartete
 *      Zinsdifferenz → Kapitalfluss → Kurs. Inflation wirkt nie direkt auf
 *      die Währung, nur über die Notenbank.
 *   3. Nur die Überraschung bewegt: Ist gegen Erwartung, nie gegen den Vorwert.
 *   4. Liegt die Inflation im Zielband, muss die Notenbank nicht reagieren.
 *   5. Ein Zinsentscheid kann auch beim Halten überraschen (Stimmen, Ton).
 *   6. Beim Franken greift die SNB auch direkt am Devisenmarkt ein.
 *
 * Ausgabe ist eine Einordnung, nie eine Kauf- oder Verkaufsempfehlung.
 */
import {
  entscheidUrteil, fmtAbweichung, fmtWert, istNotenbankTon,
  type EntscheidPruefung, type Release,
} from "./releases";
import { INFLATIONSZIELE, Z_IM_RAHMEN, Z_STARK, zielLage } from "./ziele";

/* ------------------------------------------------------------ Prüfung */

/** Eine Zeile von public.makro_entscheid_pruefung. */
export interface PruefungZeile {
  release_id: string;
  ist: number | null;
  stimmen: string | null;
  ton: EntscheidPruefung["ton"];
  notiz: string | null;
  quelle: string | null;
}

/**
 * Notenbank-Entscheide mit Kerims Prüfung zusammenführen.
 *
 * - Geprüft: das bestätigte Ist gilt (überschreibt einen falsch gelesenen
 *   Wert), dazu Stimmen und Ton.
 * - Nicht geprüft, Ist = Erwartung: nichts zu tun.
 * - Nicht geprüft, Ist ≠ Erwartung: „unbestätigt", z wird nicht gewertet.
 *   Echte Zinsüberraschungen sind selten, falsch gelesene Werte nicht.
 */
export function mitPruefung(releases: Release[], pruefungen: PruefungZeile[]): Release[] {
  const nachId = new Map(pruefungen.map((p) => [p.release_id, p]));
  return releases.map((r) => {
    if (r.kategorie !== "notenbank") return r;
    const p = nachId.get(r.id);
    if (p) {
      const ist = p.ist ?? r.ist;
      const abw = ist !== null && r.erwartung !== null ? Math.round((ist - r.erwartung) * 1e4) / 1e4 : null;
      return {
        ...r,
        ist,
        abweichung: abw,
        // Ein Zinsschritt von 25 Basispunkten neben der Erwartung = z 1.
        z: abw === null ? null : Math.max(-3, Math.min(3, Math.round((abw / 0.25) * 1000) / 1000)),
        pruefung: { status: "bestaetigt", ton: p.ton ?? null, stimmen: p.stimmen, notiz: p.notiz, quelle: p.quelle },
      };
    }
    if (r.ist !== null && r.erwartung !== null && Math.abs(r.ist - r.erwartung) >= 0.001) {
      return {
        ...r,
        z: null,
        pruefung: { status: "unbestaetigt", ton: null, stimmen: null, notiz: null, quelle: null },
      };
    }
    return r;
  });
}

/* ---------------------------------------------------------- Einstufung */

export type Stufe = "im Rahmen" | "Überraschung" | "starke Überraschung";

export function stufeVon(z: number | null): Stufe | null {
  if (z === null) return null;
  const a = Math.abs(z);
  if (a < Z_IM_RAHMEN) return "im Rahmen";
  if (a < Z_STARK) return "Überraschung";
  return "starke Überraschung";
}

/* ------------------------------------------------------------- Kette */

export interface KettenSchritt {
  schritt: "Zahl" | "Notenbank" | "Zinsdifferenz" | "Kapitalfluss" | "Kurs";
  text: string;
}

export interface Einordnung {
  stufe: Stufe | null;
  /** +1 stützt die Währung, −1 belastet, 0 neutral, null offen. */
  richtung: 1 | -1 | 0 | null;
  kette: KettenSchritt[];
  warnungen: string[];
}

const SNB_WARNUNG = "CHF: Die SNB kann jederzeit ohne Termin am Devisenmarkt eingreifen. Schutz ist die Positionsgrösse, nicht der Stop (15.01.2015).";

/** Termine der anderen Währungen ±24 h — die andere Seite des Paares. */
export function andereSeite(r: Release, alle: Release[], fenster_h = 24): Release[] {
  const t = Date.parse(r.event_time);
  return alle
    .filter((x) => x.ccy !== r.ccy && (x.impact === "High" || x.kategorie === "notenbank"))
    .filter((x) => Math.abs(Date.parse(x.event_time) - t) <= fenster_h * 3_600_000)
    .sort((a, b) => a.event_time.localeCompare(b.event_time));
}

function zielText(r: Release): string | null {
  const lage = zielLage(r.ccy, r.serie, r.ist);
  const ziel = INFLATIONSZIELE[r.ccy];
  if (!lage || !ziel) return null;
  if (lage === "im_band") return `im Zielband (${ziel.text})`;
  return lage === "ueber" ? `über dem Ziel (${ziel.text})` : `unter dem Ziel (${ziel.text})`;
}

/**
 * Die Kette in Worten plus Warnhinweise. `alle` = Releases im Umfeld
 * (für die andere Seite des Paares).
 */
export function einordnung(r: Release, alle: Release[] = []): Einordnung {
  const warnungen: string[] = [];
  const kette: KettenSchritt[] = [];
  const ccy = r.ccy;

  // Reden, Protokolle, Statements: keine Zahl, es zählt der Ton.
  if (istNotenbankTon(r.titel)) {
    kette.push({ schritt: "Notenbank", text: "Keine Zahl — es zählt der Ton: falkenhaft (Zinsen höher oder länger hoch) stützt, taubenhaft (Senkungen in Sicht) belastet." });
    warnungen.push("Ton selbst lesen: Was ändert sich am nächsten Zinsschritt gegenüber der bisherigen Erwartung?");
    if (ccy === "CHF") warnungen.push(SNB_WARNUNG);
    return { stufe: null, richtung: null, kette, warnungen };
  }

  if (r.ist === null || r.erwartung === null) {
    warnungen.push(r.erwartung === null
      ? "Keine Erwartung im Kalender — ohne Konsens keine Überraschung, der Vorwert ersetzt ihn nicht."
      : "Noch kein Ist.");
    return { stufe: null, richtung: null, kette, warnungen };
  }

  /* Zinsentscheid */
  if (r.kategorie === "notenbank") {
    const u = entscheidUrteil(r);
    kette.push({ schritt: "Zahl", text: `Entscheid ${fmtWert(r.ist, r.einheit)}, erwartet ${fmtWert(r.erwartung, r.einheit)}${r.pruefung?.stimmen ? `, Stimmen ${r.pruefung.stimmen}` : ""}.` });
    kette.push({ schritt: "Notenbank", text: u.text + "." });
    const richtung: 1 | -1 | 0 | null = u.ton === "gut" ? 1 : u.ton === "schlecht" ? -1 : u.ton === "neutral" ? 0 : null;
    if (richtung === 1 || richtung === -1) {
      kette.push({ schritt: "Zinsdifferenz", text: `Erwarteter Zinspfad ${richtung > 0 ? "höher" : "tiefer"} als gedacht → Zinsdifferenz ${richtung > 0 ? "zugunsten" : "zulasten"} ${ccy}.` });
      kette.push({ schritt: "Kapitalfluss", text: `Geld fliesst eher ${richtung > 0 ? "in den" : "aus dem"} ${ccy}.` });
      kette.push({ schritt: "Kurs", text: `${ccy} tendenziell ${richtung > 0 ? "↑" : "↓"} — sofern die andere Seite nicht stärker zieht.` });
    } else if (richtung === 0) {
      kette.push({ schritt: "Kurs", text: "Wie erwartet → eingepreist. Neue Bewegung nur aus Stimmen, Statement und Ausblick." });
    }
    if (r.pruefung?.status === "unbestaetigt") {
      warnungen.push("Abweichung vom Konsens ohne Bestätigung: Wert an einer zweiten Quelle prüfen (Notenbank-Mitteilung) und als Prüfung eintragen.");
    } else if (!r.pruefung?.ton) {
      warnungen.push("Zinsentscheid: Stimmen, Statement und Ausblick prüfen — auch ein Halten kann falkenhaft oder taubenhaft sein.");
    }
    warnungen.push(...seitenWarnungen(r, alle));
    if (ccy === "CHF") warnungen.push(SNB_WARNUNG);
    return { stufe: stufeVon(r.z), richtung, kette, warnungen };
  }

  /* Zahl mit Erwartung und Ist */
  const stufe = stufeVon(r.z);
  const z = r.z ?? 0;
  const besser = z > 0;
  const lage = zielText(r);
  kette.push({
    schritt: "Zahl",
    text: `Ist ${fmtWert(r.ist, r.einheit)} gegen Erwartung ${fmtWert(r.erwartung, r.einheit)} (${fmtAbweichung(r.abweichung, r.einheit)})`
      + ` → ${stufe ?? "nicht bewertbar"}${stufe && stufe !== "im Rahmen" ? (besser ? ", stützt" : ", belastet") : ""}`
      + `${lage ? `; ${lage}` : ""}.`,
  });

  if (stufe === "im Rahmen") {
    kette.push({ schritt: "Notenbank", text: "Ändert die Erwartung an die Notenbank kaum — eingepreist." });
    kette.push({ schritt: "Kurs", text: "Keine neue Bewegung aus dieser Zahl zu erwarten." });
    warnungen.push("Im Rahmen der Erwartung: eingepreist (Merksatz 3).");
  } else if (stufe !== null) {
    const imBand = zielLage(r.ccy, r.serie, r.ist) === "im_band";
    const nb = besser
      ? "Markt erwartet die Notenbank eher straffer (Erhöhung früher oder Zinsen länger hoch)"
      : "Markt erwartet die Notenbank eher lockerer (Senkung früher oder Erhöhung später)";
    kette.push({ schritt: "Notenbank", text: `${nb}${imBand ? " — aber im Zielband: wenig Druck zu handeln" : ""}.` });
    kette.push({ schritt: "Zinsdifferenz", text: `Erwartete Zinsdifferenz ${besser ? "zugunsten" : "zulasten"} ${ccy}.` });
    kette.push({ schritt: "Kapitalfluss", text: `Geld fliesst eher ${besser ? "in den" : "aus dem"} ${ccy}.` });
    kette.push({ schritt: "Kurs", text: `${ccy} tendenziell ${besser ? "↑" : "↓"} — sofern die andere Seite nicht stärker zieht.` });
    if (imBand) {
      warnungen.push(`Im Zielband (${INFLATIONSZIELE[r.ccy]?.text}): Die Notenbank muss nicht reagieren — die Wirkung ist oft klein (CHF August 2026).`);
    }
  }

  if (r.impact !== "High" && r.impact !== "Medium") warnungen.push("Geringe Wichtigkeit: allein kein Bias.");
  warnungen.push(...seitenWarnungen(r, alle));
  if (ccy === "CHF") warnungen.push(SNB_WARNUNG);

  const richtung: 1 | -1 | 0 | null = stufe === null ? null : stufe === "im Rahmen" ? 0 : besser ? 1 : -1;
  return { stufe, richtung, kette, warnungen };
}

function seitenWarnungen(r: Release, alle: Release[]): string[] {
  const andere = andereSeite(r, alle);
  if (andere.length === 0) return [];
  const namen = [...new Set(andere.map((x) => `${x.ccy} ${x.titel}`))].slice(0, 4);
  return [`Andere Seite ±24 h: ${namen.join(" · ")}. Paare gegen diese Währungen zuerst prüfen.`];
}
