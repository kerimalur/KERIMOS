/**
 * Wann darf ein Alarm raus?
 *
 * Bewusst ohne Datenbank, ohne Netz, ohne `server-only`: reine Funktionen,
 * die sich mit `tools/checks/alarm-regeln.mts` prüfen lassen. Der Versand
 * (Push, Telegram) liegt in `versand.ts`, das Laden in `einstellungen.ts`.
 *
 * Die Trennung ist kein Selbstzweck. Ein Alarmsystem, dessen Filterlogik man
 * nur im Ernstfall testen kann, merkt man erst dann, wenn es schweigt.
 */

/**
 * Zwei Arten, seit dem 27.08.2026.
 *
 * **„naehe" ist entfallen** — die Vorwarnung „16 Pips zur GVA". Kerims Ansage:
 * *„das mit den 30 Pips vor der GVA möchte ich nicht mehr."* Sie war der
 * Hauptgrund für die Flut: eine Linie, an die sich der Preis annähert, bleibt
 * tagelang in Reichweite und meldete sich jeden Tag erneut.
 *
 * Alte Zeilen mit `naehe` in `arten` stören nicht: `ausZeile` filtert
 * unbekannte Werte weg.
 */
export type Alarmart = "hit" | "zeit";

export const ALARMARTEN: readonly Alarmart[] = ["hit", "zeit"] as const;

export const ART_LABEL: Record<Alarmart, string> = {
  hit: "Treffer",
  zeit: "Erinnerung",
};

export const ART_BESCHREIBUNG: Record<Alarmart, string> = {
  hit: "Die Linie ist erreicht oder durchschritten — einmalig, danach nie wieder.",
  zeit: "Eine bei der Linie gesetzte Uhrzeit ist da — einmalig.",
};

export const ART_EMOJI: Record<Alarmart | "test", string> = {
  hit: "🚨",
  zeit: "⏰",
  test: "🧪",
};

export interface AlarmEinstellungen {
  /** Web-Push an die angemeldeten Geräte (Handy-Startbildschirm). */
  push_an: boolean;
  /** Telegram-Nachricht über den Bot. */
  telegram_an: boolean;
  /** Überschreibt TELEGRAM_CHAT_ID aus der Umgebung. Leer = Umgebung. */
  telegram_chat_id: string | null;
  /** Welche Arten überhaupt verschickt werden. */
  arten: Alarmart[];
  /** Leere Liste = alle Paare. Sonst nur diese. */
  paare: string[];
  /** Ruhezeit "HH:MM"–"HH:MM", darf über Mitternacht gehen. Null = keine. */
  ruhe_von: string | null;
  ruhe_bis: string | null;
  /** Treffer dürfen auch in der Ruhezeit raus. Standard: ja. */
  ruhe_ausser_hit: boolean;
  /** Obergrenze über alle Linien pro Tag. 0 = keine Grenze. */
  max_pro_tag: number;
  /** Vollständig stumm bis einschliesslich diesem Tag ("YYYY-MM-DD"). */
  stumm_bis: string | null;
}

/**
 * Standard, wenn noch nichts gespeichert wurde.
 *
 * Push an, Telegram aus: Telegram braucht Bot-Token und Chat-ID, und ein
 * Kanal, der eingeschaltet ist, aber nicht konfiguriert, produziert bei jedem
 * Lauf eine Fehlermeldung statt einer Nachricht.
 */
export const STANDARD_EINSTELLUNGEN: AlarmEinstellungen = {
  push_an: true,
  telegram_an: false,
  telegram_chat_id: null,
  arten: ["hit", "zeit"],
  paare: [],
  ruhe_von: null,
  ruhe_bis: null,
  ruhe_ausser_hit: true,
  max_pro_tag: 40,
  stumm_bis: null,
};

/* ------------------------------------------------------------------ Zeit */

/**
 * "22:30" oder "22:30:00" → Minuten seit Mitternacht. Null bei Unsinn.
 *
 * Postgres liefert `time` als "HH:MM:SS", ein `<input type="time">` als
 * "HH:MM" — beide Formen landen hier, also müssen beide gehen.
 */
export function minutenAus(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const treffer = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!treffer) return null;
  const h = Number(treffer[1]);
  const m = Number(treffer[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Minuten seit Mitternacht → "HH:MM". */
export function alsUhrzeit(minuten: number): string {
  const m = ((Math.round(minuten) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Liegt `jetzt` in der Ruhezeit?
 *
 * Halboffen [von, bis): um 07:00 bei einer Ruhezeit 22:00–07:00 ist wieder
 * Betrieb. Der Umschlag über Mitternacht ist der Normalfall, nicht die
 * Ausnahme — deshalb steht er hier explizit und nicht als Sonderfall beim
 * Aufrufer. Sind beide Zeiten gleich, gibt es keine Ruhezeit: die andere
 * Lesart ("immer ruhig") würde ein Alarmsystem versehentlich komplett
 * abschalten.
 */
export function inRuhezeit(
  jetzt: number, von: string | null, bis: string | null,
): boolean {
  const a = minutenAus(von);
  const b = minutenAus(bis);
  if (a === null || b === null || a === b) return false;
  return a < b ? jetzt >= a && jetzt < b : jetzt >= a || jetzt < b;
}

/* ------------------------------------------------------------------ Paare */

/** "eur/usd", "EUR_USD", " eurusd " → "EURUSD". */
export function normPaar(pair: string): string {
  return pair.toUpperCase().replace(/[^A-Z]/g, "");
}

/** Leere Liste heisst „alle" — nicht „keins". */
export function paarErlaubt(einst: AlarmEinstellungen, pair: string): boolean {
  if (einst.paare.length === 0) return true;
  const gesucht = normPaar(pair);
  return einst.paare.some((p) => normPaar(p) === gesucht);
}

/* ------------------------------------------------------------------ Prüfung */

export interface Lage {
  art: Alarmart | "test";
  pair?: string;
  /** Minuten seit Mitternacht, Zürcher Zeit. */
  jetztMinuten: number;
  /** Heutiges Datum "YYYY-MM-DD", Zürcher Zeit. */
  heute: string;
  /** Wie viele Alarme heute schon rausgingen. */
  bereitsGesendet?: number;
}

export interface Pruefung {
  erlaubt: boolean;
  /** Warum nicht — kurz genug für die Antwortzeile des Cron-Laufs. */
  grund: string | null;
}

const ERLAUBT: Pruefung = { erlaubt: true, grund: null };
const nein = (grund: string): Pruefung => ({ erlaubt: false, grund });

/**
 * Die einzige Stelle, an der über „raus oder nicht" entschieden wird.
 *
 * Testmeldungen gehen bewusst an allen Filtern vorbei — ausser an der Frage,
 * ob überhaupt ein Kanal aktiv ist. Ein Testknopf, der wegen Ruhezeit
 * schweigt, ist kein Test, sondern eine zweite Fehlerquelle.
 */
export function pruefe(einst: AlarmEinstellungen, lage: Lage): Pruefung {
  if (!einst.push_an && !einst.telegram_an) {
    return nein("kein Kanal eingeschaltet");
  }
  if (lage.art === "test") return ERLAUBT;

  if (einst.stumm_bis && lage.heute <= einst.stumm_bis) {
    return nein(`stumm bis ${einst.stumm_bis}`);
  }
  if (!einst.arten.includes(lage.art)) {
    return nein(`Art „${ART_LABEL[lage.art]}" ist aus`);
  }
  if (lage.pair && !paarErlaubt(einst, lage.pair)) {
    return nein(`${normPaar(lage.pair)} steht nicht auf der Paarliste`);
  }

  // Ruhezeit: der Treffer ist genau die Meldung, für die man nachts wach
  // werden will. Deshalb die Ausnahme — abschaltbar, aber standardmässig an.
  const ruht = inRuhezeit(lage.jetztMinuten, einst.ruhe_von, einst.ruhe_bis);
  if (ruht && !(lage.art === "hit" && einst.ruhe_ausser_hit)) {
    return nein(`Ruhezeit ${einst.ruhe_von}–${einst.ruhe_bis}`);
  }

  if (einst.max_pro_tag > 0 && (lage.bereitsGesendet ?? 0) >= einst.max_pro_tag) {
    return nein(`Tagesgrenze ${einst.max_pro_tag} erreicht`);
  }

  return ERLAUBT;
}

/* ------------------------------------------------------------------ Formular */

/**
 * Aus einem abgeschickten Formular Einstellungen bauen.
 *
 * Steht hier und nicht in der Server Action, weil genau hier die Fehler
 * passieren: eine Checkbox, die im FormData fehlt statt „false" zu sein,
 * ein leeres Zeitfeld, das als "" ankommt und in Postgres als `time`
 * scheitert. Prüfbar ohne laufenden Server.
 */
export function ausFormular(hole: (name: string) => string | null): AlarmEinstellungen {
  const text = (name: string): string | null => {
    const wert = hole(name)?.trim();
    return wert ? wert : null;
  };
  // Nicht angehakte Checkboxen tauchen im FormData gar nicht auf.
  const an = (name: string): boolean => hole(name) !== null;

  // Number(null) und Number("") sind beide 0 - ohne die erste Zeile würde ein
  // fehlendes Feld stillschweigend „keine Grenze" bedeuten statt „Standard".
  const zahl = (name: string, standard: number): number => {
    const roh = hole(name)?.trim();
    if (!roh) return standard;
    const wert = Number(roh);
    return Number.isFinite(wert) && wert >= 0 ? Math.floor(wert) : standard;
  };

  const arten = ALARMARTEN.filter((a) => an(`art_${a}`));

  return {
    push_an: an("push_an"),
    telegram_an: an("telegram_an"),
    telegram_chat_id: text("telegram_chat_id"),
    // Keine Art angehakt ist eine echte Aussage („nichts schicken"), aber
    // fast immer ein Versehen. Der Kanal-Schalter ist der richtige Ort dafür,
    // deshalb hier nicht heimlich zurückfallen — es wird gespeichert, was
    // dasteht, und die Oberfläche warnt sichtbar.
    arten: [...arten],
    paare: (hole("paare") ?? "")
      .split(/[\s,;]+/)
      .map(normPaar)
      .filter((p) => p.length >= 6),
    ruhe_von: text("ruhe_von"),
    ruhe_bis: text("ruhe_bis"),
    ruhe_ausser_hit: an("ruhe_ausser_hit"),
    max_pro_tag: zahl("max_pro_tag", STANDARD_EINSTELLUNGEN.max_pro_tag),
    stumm_bis: text("stumm_bis"),
  };
}

/** Was an den Einstellungen erklärungsbedürftig ist — für die Oberfläche. */
export function warnungen(einst: AlarmEinstellungen): string[] {
  const liste: string[] = [];
  if (!einst.push_an && !einst.telegram_an) {
    liste.push("Beide Kanäle sind aus — es geht gar nichts raus.");
  }
  if (einst.arten.length === 0) {
    liste.push("Keine Alarmart angehakt — es geht gar nichts raus.");
  }
  if (einst.telegram_an && !einst.telegram_chat_id) {
    liste.push("Telegram ist an, aber ohne Chat-ID im Feld — es gilt TELEGRAM_CHAT_ID aus der Umgebung.");
  }
  const a = minutenAus(einst.ruhe_von);
  const b = minutenAus(einst.ruhe_bis);
  if ((a === null) !== (b === null)) {
    liste.push("Ruhezeit braucht beide Zeiten — mit nur einer ist sie unwirksam.");
  } else if (a !== null && b !== null && a === b) {
    liste.push("Ruhezeit-Anfang und -Ende sind gleich — damit ist sie unwirksam.");
  }
  if (einst.stumm_bis) {
    liste.push(`Alles stumm bis einschliesslich ${einst.stumm_bis}.`);
  }
  if (einst.arten.includes("hit") && einst.paare.length > 0) {
    liste.push(`Nur ${einst.paare.length} Paar(e) auf der Liste — Linien anderer Paare melden sich nicht.`);
  }
  return liste;
}
