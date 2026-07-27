/* ============================================================
   Kontoauszug im Festbreiten-Format (Raiffeisen und ähnliche)
   ------------------------------------------------------------
   Solche Auszüge sind keine echten CSV-Dateien: jede Zeile ist ein
   Stück Text, die Spalten entstehen durch Leerzeichen. Zudem
   wiederholt sich der Kopf auf jeder Seite und die Spalten
   verschieben sich dabei um ein paar Zeichen.

   Deshalb wird der Kopf jeder Seite neu vermessen und der Betrag
   nur im Zahlenbereich gesucht — sonst wird eine Filialnummer im
   Buchungstext ("Einkauf 177.13 kkiosk") als Betrag gelesen.
   ============================================================ */

const DATE_START = /^(\d{2})\.(\d{2})\.(\d{4})\s/;
const AMOUNT = /(?<![\d.'’])\d{1,3}(?:['’]\d{3})*\.\d{2}(?![\d.])/g;
const HEADER = /^\s*Datum\s+Text\s+Belastung\s+Gutschrift/;
const TOTAL = /^\s*(Umsatz|Total)\s+([\d'’.]+)\s+([\d'’.]+)/;

/** Toleranz für die Spaltendrift zwischen den Seiten. */
const TOLERANCE = 4;

const TRANSFER_PATTERNS = [
  /^übertrag\s+(auf|von)/i,
  /^umbuchung/i,
  /eigenes?\s+konto/i,
];

export interface StatementRow {
  occurred_on: string;
  amount: number;
  description: string;
  counterparty: string | null;
  /** Verschiebung zwischen eigenen Konten - zählt nicht als Einnahme oder Ausgabe. */
  is_transfer: boolean;
}

export interface StatementResult {
  rows: StatementRow[];
  sumDebit: number;
  sumCredit: number;
  /** Vom Auszug selbst genannte Totale, falls vorhanden. */
  declaredDebit: number | null;
  declaredCredit: number | null;
  balanced: boolean | null;
  pages: number;
  transferCount: number;
  warnings: string[];
}

/** Zeilen wie "…" aus einem Ein-Spalten-Export entpacken. */
export function unwrapLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      const t = l.trimEnd();
      if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
        return t.slice(1, -1).replace(/""/g, '"');
      }
      return t;
    });
}

/** Erkennt, ob es sich um einen Festbreiten-Auszug und nicht um echtes CSV handelt. */
export function looksLikeStatement(text: string): boolean {
  return unwrapLines(text).slice(0, 400).some((l) => HEADER.test(l));
}

function toNumber(raw: string): number {
  return Number(raw.replace(/['’]/g, ""));
}

function isTransfer(description: string): boolean {
  return TRANSFER_PATTERNS.some((p) => p.test(description.trim()));
}

export function parseStatement(text: string): StatementResult {
  const lines = unwrapLines(text);
  const rows: StatementRow[] = [];
  const warnings: string[] = [];

  let columns: { numStart: number; threshold: number; textEnd: number } | null = null;
  let pages = 0;
  let declaredDebit: number | null = null;
  let declaredCredit: number | null = null;

  for (const line of lines) {
    if (HEADER.test(line)) {
      const debitStart = line.indexOf("Belastung");
      const debitEnd = debitStart + "Belastung".length;
      const creditStart = line.indexOf("Gutschrift");
      columns = {
        numStart: debitStart - TOLERANCE,
        threshold: (debitEnd + creditStart) / 2,
        textEnd: debitStart,
      };
      pages++;
      continue;
    }

    const total = TOTAL.exec(line);
    if (total) {
      declaredDebit = toNumber(total[2]);
      declaredCredit = toNumber(total[3]);
      continue;
    }

    const dateMatch = DATE_START.exec(line);
    if (!dateMatch || !columns) continue;   // Detailzeilen ohne Datum gehören zur Buchung darüber

    AMOUNT.lastIndex = 0;
    const tokens = [...line.matchAll(AMOUNT)].filter(
      (m) => (m.index ?? 0) >= columns!.numStart
    );
    if (tokens.length === 0) continue;

    const token = tokens[0];
    const start = token.index ?? 0;
    const end = start + token[0].length;
    const value = toNumber(token[0]);
    const amount = end <= columns.threshold ? -value : value;

    const description = line
      .slice(10, Math.max(10, columns.textEnd))
      .trim()
      .replace(/\s{2,}/g, " ");

    rows.push({
      occurred_on: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      amount,
      description,
      counterparty: null,
      is_transfer: isTransfer(description),
    });
  }

  const sumDebit = round2(rows.reduce((s, r) => (r.amount < 0 ? s - r.amount : s), 0));
  const sumCredit = round2(rows.reduce((s, r) => (r.amount > 0 ? s + r.amount : s), 0));

  let balanced: boolean | null = null;
  if (declaredDebit !== null && declaredCredit !== null) {
    balanced =
      Math.abs(sumDebit - declaredDebit) < 0.05 &&
      Math.abs(sumCredit - declaredCredit) < 0.05;
    if (!balanced) {
      warnings.push(
        `Die Summen weichen vom Auszug ab: Belastung ${fmt(sumDebit)} statt ` +
        `${fmt(declaredDebit)}, Gutschrift ${fmt(sumCredit)} statt ${fmt(declaredCredit)}.`
      );
    }
  } else {
    warnings.push("Der Auszug nennt keine Gesamtsummen — die Zahlen sind nicht gegengerechnet.");
  }

  if (rows.length === 0) {
    warnings.push("Keine Buchungen gefunden. Wurde beim Export das richtige Format gewählt?");
  }

  return {
    rows, sumDebit, sumCredit, declaredDebit, declaredCredit, balanced, pages,
    transferCount: rows.filter((r) => r.is_transfer).length,
    warnings,
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmt(n: number) {
  return n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
