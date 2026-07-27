/* ============================================================
   CSV-Import für Bankauszüge
   ------------------------------------------------------------
   Bankexporte sind selten sauber: mal mit Kopfzeile, mal ohne,
   mal eine Betragsspalte, mal Belastung/Gutschrift getrennt, oft
   noch eine Saldo-Spalte dazwischen. Deshalb wird die Struktur
   aus dem Inhalt erschlossen und nicht aus der Kopfzeile geraten.
   ============================================================ */

export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delim = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delim) { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Wählt das Trennzeichen, das die gleichmässigste Spaltenzahl ergibt.
 * Reines Zählen führt in die Irre, sobald Buchungstexte Kommas enthalten.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "").slice(0, 40);
  if (lines.length === 0) return ";";

  let best = ";";
  let bestScore = -1;

  for (const d of [";", "\t", ",", "|"]) {
    const counts = lines.map((l) => splitOutsideQuotes(l, d).length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const mode = modeOf(counts);
    if (mode < 2) continue;
    const consistency = counts.filter((c) => c === mode).length / counts.length;
    const score = consistency * 10 + Math.min(mode, 8);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitOutsideQuotes(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const c of line) {
    if (c === '"') { q = !q; continue; }
    if (c === delim && !q) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

interface NumericLayout {
  balance: number;
  amount: number;
  debit: number;
  credit: number;
}

/**
 * Erschliesst die Zahlenspalten am Inhalt statt an der Kopfzeile.
 *
 * Eine Saldo-Spalte verrät sich dadurch, dass ihre Differenz von Zeile zu
 * Zeile genau dem Betrag daneben entspricht — entweder einer einzelnen
 * Betragsspalte oder der Differenz aus Gutschrift und Belastung. Damit ist
 * gleichzeitig geklärt, welche der beiden Spalten die Gutschrift ist.
 */
function analyzeNumericLayout(
  rows: string[][], candidates: number[], skipFirst: boolean
): NumericLayout | null {
  if (candidates.length < 2) return null;
  const body = skipFirst ? rows.slice(1) : rows;
  const values = body.map((r) => {
    const v: Record<number, number | null> = {};
    for (const i of candidates) v[i] = parseAmount(r[i] ?? "");
    return v;
  });

  const matches = (
    balance: number,
    delta: (row: Record<number, number | null>) => number
  ): boolean => {
    const series = values.filter((v) => v[balance] !== null);
    if (series.length < 4) return false;
    let hits = 0;
    for (let i = 1; i < series.length; i++) {
      const step = series[i][balance]! - series[i - 1][balance]!;
      if (Math.abs(step - delta(series[i])) < 0.02) hits++;
    }
    return hits / (series.length - 1) > 0.8;
  };

  for (const balance of candidates) {
    // Eine einzelne Betragsspalte
    for (const amount of candidates) {
      if (amount === balance) continue;
      if (matches(balance, (row) => row[amount] ?? 0)) {
        return { balance, amount, debit: -1, credit: -1 };
      }
    }
    // Getrennte Gutschrift und Belastung
    for (const credit of candidates) {
      for (const debit of candidates) {
        if (credit === debit || credit === balance || debit === balance) continue;
        if (matches(balance, (row) => (row[credit] ?? 0) - (row[debit] ?? 0))) {
          return { balance, amount: -1, debit, credit };
        }
      }
    }
  }
  return null;
}

function modeOf(nums: number[]): number {
  const m = new Map<number, number>();
  for (const n of nums) m.set(n, (m.get(n) ?? 0) + 1);
  let best = 0, bestCount = 0;
  for (const [n, c] of m) if (c > bestCount) { bestCount = c; best = n; }
  return best;
}

/* ------------------------------------------------------------ Erkennung */

export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let year = m[3];
    if (year.length === 2) year = Number(year) > 70 ? `19${year}` : `20${year}`;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Beträge in Schweizer und internationaler Schreibweise.
 * 1'234.55 · 1.234,55 · -89.90 · 89.90- · (89.90) · CHF 2 500.00
 */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  if (!/\d/.test(s)) return null;
  // "2022-07-01 00:00:00.0" ist kein Betrag, auch wenn nur Ziffern und
  // Trennzeichen darin vorkommen.
  if (s.includes(":")) return null;
  if (parseDate(s) !== null) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1).trim(); }
  if (s.startsWith("+")) s = s.slice(1).trim();

  // Alles ausser Ziffern und Trennzeichen entfernen; Apostroph und
  // schmales Leerzeichen sind Tausendertrenner.
  const stripped = s.replace(/[^\d.,]/g, "");
  if (!stripped) return null;

  // Enthielt der Rest Buchstaben ausser einer Währungsangabe? Dann kein Betrag.
  const letters = s.replace(/[\d\s.,'’`´+-]/g, "");
  if (letters && !/^(chf|eur|usd|fr\.?|sfr)$/i.test(letters)) return null;

  let normalized = stripped;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma > lastDot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else normalized = normalized.replace(/,/g, "");

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* -------------------------------------------------- Spaltenanalyse */

export interface ColumnStats {
  index: number;
  header: string;
  filled: number;   // Anteil nicht-leerer Zellen
  dateRate: number; // Anteil gültiger Datumsangaben unter den gefüllten
  amountRate: number;
  avgLength: number;
}

export function analyzeColumns(rows: string[][], skipFirst: boolean): ColumnStats[] {
  const header = rows[0] ?? [];
  const body = (skipFirst ? rows.slice(1) : rows).slice(0, 300);
  const width = Math.max(...rows.map((r) => r.length), 0);
  const stats: ColumnStats[] = [];

  for (let i = 0; i < width; i++) {
    let filled = 0, dates = 0, amounts = 0, len = 0;
    for (const r of body) {
      const cell = (r[i] ?? "").trim();
      if (!cell) continue;
      filled++;
      len += cell.length;
      if (parseDate(cell)) dates++;
      if (parseAmount(cell) !== null) amounts++;
    }
    const n = Math.max(1, body.length);
    stats.push({
      index: i,
      header: (header[i] ?? "").trim(),
      filled: filled / n,
      dateRate: filled ? dates / filled : 0,
      amountRate: filled ? amounts / filled : 0,
      avgLength: filled ? len / filled : 0,
    });
  }
  return stats;
}

/** Erste Zeile ist eine Kopfzeile, wenn sie kein Datum enthält, die folgenden aber schon. */
export function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstHasDate = rows[0].some((c) => parseDate(c));
  const restHaveDates = rows.slice(1, 12).filter((r) => r.some((c) => parseDate(c))).length;
  return !firstHasDate && restHaveDates > 0;
}

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  counterparty: number;
}

export interface SniffResult {
  mapping: ColumnMapping;
  hasHeader: boolean;
  notes: string[];
  stats: ColumnStats[];
}

const EMPTY_MAPPING: ColumnMapping = {
  date: -1, description: -1, amount: -1, debit: -1, credit: -1, counterparty: -1,
};

/**
 * Erschliesst die Spaltenbelegung aus dem Inhalt. Die Kopfzeile wird nur
 * als Zusatzhinweis verwendet, nie als alleinige Grundlage.
 */
export function sniffMapping(rows: string[][]): SniffResult {
  const notes: string[] = [];
  const hasHeader = detectHeader(rows);
  const stats = analyzeColumns(rows, hasHeader);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };

  if (stats.length === 0) {
    notes.push("Keine Spalten erkannt — stimmt das Trennzeichen?");
    return { mapping, hasHeader, notes, stats };
  }
  if (stats.length === 1) {
    notes.push(
      "Die Datei hat nur eine Spalte. Vermutlich wurde beim Export kein " +
      "Trennzeichen gesetzt oder das PDF wurde nur als Text abgelegt."
    );
    return { mapping, hasHeader, notes, stats };
  }

  const headerHint = (s: ColumnStats, ...needles: string[]) =>
    needles.some((n) => s.header.toLowerCase().includes(n));

  // --- Datum: höchste Trefferquote. Die Schwelle ist bewusst tief, weil
  // Auszüge Zwischentotale und Seitenköpfe enthalten, die kein Datum tragen. ---
  const dateCol = [...stats].sort((a, b) => b.dateRate - a.dateRate)[0];
  if (dateCol && dateCol.dateRate >= 0.35) {
    mapping.date = dateCol.index;
  } else {
    notes.push("Keine Spalte enthält überwiegend Datumsangaben.");
  }

  // --- Zahlenspalten ---
  const numeric = stats.filter(
    (s) => s.index !== mapping.date && s.amountRate >= 0.7 && s.filled > 0.05
  );

  // Der Inhalt entscheidet: passt die Saldo-Entwicklung zu einer Betragsspalte
  // oder zu einem Soll/Haben-Paar, ist die ganze Belegung geklärt.
  let candidates = numeric;
  if (numeric.length >= 2) {
    const layout = analyzeNumericLayout(rows, numeric.map((s) => s.index), hasHeader);
    if (layout) {
      notes.push(`Spalte ${layout.balance + 1} ist der laufende Saldo und wird ignoriert.`);
      mapping.amount = layout.amount;
      mapping.debit = layout.debit;
      mapping.credit = layout.credit;
      candidates = [];
    } else {
      const saldo = numeric.find((s) => headerHint(s, "saldo", "balance", "kontostand"));
      if (saldo) {
        candidates = numeric.filter((s) => s.index !== saldo.index);
        notes.push(`Spalte ${saldo.index + 1} sieht nach Saldo aus und wird ignoriert.`);
      }
    }
  }

  if (candidates.length === 1) {
    mapping.amount = candidates[0].index;
  } else if (candidates.length >= 2) {
    // Belastung/Gutschrift: zwei Spalten, die sich weitgehend abwechseln.
    const [a, b] = [...candidates].sort((x, y) => y.filled - x.filled).slice(0, 2);
    const complementary = a.filled + b.filled <= 1.25;

    const byHeaderDebit = candidates.find((s) =>
      headerHint(s, "belastung", "soll", "debit", "ausgang", "abgang", "lastschrift"));
    const byHeaderCredit = candidates.find((s) =>
      headerHint(s, "gutschrift", "haben", "credit", "eingang", "zugang"));

    // Nur echte Paare: "Credit/Debit Amount" ist EINE Spalte und
    // darf nicht gleichzeitig als Soll und als Haben gelten.
    if (byHeaderDebit && byHeaderCredit && byHeaderDebit.index !== byHeaderCredit.index) {
      mapping.debit = byHeaderDebit.index;
      mapping.credit = byHeaderCredit.index;
    } else if (complementary) {
      // Ohne Kopfzeile: die häufiger gefüllte Spalte ist die Belastung.
      const left = candidates.reduce((m, s) => (s.index < m.index ? s : m));
      const right = candidates.reduce((m, s) => (s.index > m.index ? s : m));
      mapping.debit = left.index;
      mapping.credit = right.index;
      notes.push(
        `Spalte ${left.index + 1} als Belastung und ${right.index + 1} als Gutschrift ` +
        "angenommen. Bitte in der Vorschau prüfen — falls die Vorzeichen kippen, tausche die beiden."
      );
    } else {
      mapping.amount = a.index;
    }
  } else {
    notes.push("Keine Spalte enthält überwiegend Beträge.");
  }

  // --- Bezeichnung: längster Text, weder Datum noch Betrag ---
  const used = new Set([mapping.date, mapping.amount, mapping.debit, mapping.credit]);
  const textCols = stats
    .filter((s) => !used.has(s.index) && s.amountRate < 0.5 && s.dateRate < 0.5 && s.filled > 0.2)
    .sort((a, b) => b.avgLength - a.avgLength);

  if (textCols[0]) mapping.description = textCols[0].index;
  if (textCols[1] && textCols[1].avgLength >= 4) mapping.counterparty = textCols[1].index;

  return { mapping, hasHeader, notes, stats };
}

/* ------------------------------------------------------------ Abbildung */

export interface ParsedRow {
  occurred_on: string;
  amount: number;
  description: string;
  counterparty: string | null;
  /** Verschiebung zwischen eigenen Konten - zählt nicht als Einnahme oder Ausgabe. */
  is_transfer: boolean;
}

const TRANSFER_PATTERNS = [
  /übertrag\s+(auf|von)/i,
  /kontoübertrag/i,
  /umbuchung/i,
  /eigenes?\s+konto/i,
];

export function looksLikeTransfer(text: string): boolean {
  return TRANSFER_PATTERNS.some((p) => p.test(text));
}

/**
 * Liest eine Datei und rät die Zeichenkodierung. Schweizer Bankexporte
 * kommen häufig als Windows-1252 - als UTF-8 gelesen werden daraus
 * "Ã¼bertrag" und Fragezeichen mitten im Buchungstext.
 */
export function decodeBytes(buffer: ArrayBuffer): { text: string; encoding: string } {
  try {
    const strict = new TextDecoder("utf-8", { fatal: true });
    return { text: strict.decode(buffer), encoding: "UTF-8" };
  } catch {
    const fallback = new TextDecoder("windows-1252");
    return { text: fallback.decode(buffer), encoding: "Windows-1252" };
  }
}

export type SkipReason = "kein Datum" | "kein Betrag" | "Betrag null";

export interface MapResult {
  ok: ParsedRow[];
  skipped: number;
  reasons: Record<SkipReason, number>;
  /** Beispielzeilen, die nicht verwertet werden konnten. */
  samples: { row: string[]; reason: SkipReason }[];
}

export function mapRows(
  rows: string[][],
  mapping: ColumnMapping,
  hasHeader: boolean,
  appendOrphanText = true
): MapResult {
  const body = hasHeader ? rows.slice(1) : rows;
  const ok: ParsedRow[] = [];
  const reasons: Record<SkipReason, number> = {
    "kein Datum": 0, "kein Betrag": 0, "Betrag null": 0,
  };
  const samples: { row: string[]; reason: SkipReason }[] = [];
  let skipped = 0;

  const note = (row: string[], reason: SkipReason) => {
    skipped++;
    reasons[reason]++;
    if (samples.length < 5) samples.push({ row, reason });
  };

  for (const r of body) {
    const date = mapping.date >= 0 ? parseDate(r[mapping.date] ?? "") : null;

    if (!date) {
      // Fortsetzungszeile eines mehrzeiligen Buchungstexts an die vorige Buchung hängen
      const text = r.join(" ").trim();
      if (appendOrphanText && ok.length > 0 && text && !/^\s*$/.test(text)) {
        const last = ok[ok.length - 1];
        const extra = text.replace(/\s+/g, " ").slice(0, 80);
        if (extra.length > 2 && !/^[\d.,'\s-]+$/.test(extra)) {
          last.description = `${last.description} ${extra}`.trim().slice(0, 200);
          continue;
        }
      }
      note(r, "kein Datum");
      continue;
    }

    let amount: number | null = null;
    if (mapping.amount >= 0) {
      amount = parseAmount(r[mapping.amount] ?? "");
    } else {
      const debit = mapping.debit >= 0 ? parseAmount(r[mapping.debit] ?? "") : null;
      const credit = mapping.credit >= 0 ? parseAmount(r[mapping.credit] ?? "") : null;
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    }

    if (amount === null) { note(r, "kein Betrag"); continue; }
    if (amount === 0) { note(r, "Betrag null"); continue; }

    const description = (mapping.description >= 0 ? r[mapping.description] ?? "" : "").trim();
    ok.push({
      occurred_on: date,
      amount,
      description,
      counterparty: mapping.counterparty >= 0
        ? (r[mapping.counterparty] ?? "").trim() || null
        : null,
      is_transfer: looksLikeTransfer(description),
    });
  }

  return { ok, skipped, reasons, samples };
}
