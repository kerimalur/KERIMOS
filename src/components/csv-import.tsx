"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseCsv, sniffMapping, mapRows, decodeBytes,
  type ColumnMapping, type MapResult,
} from "@/lib/csv";
import { looksLikeStatement, parseStatement, type StatementResult } from "@/lib/statement";
import { importTransactions, type ImportOutcome } from "@/lib/actions";
import { Button, Card, CardTitle, Label, Select, Empty, Badge, cx } from "@/components/ui";
import { chf2, dateLabel } from "@/lib/format";
import type { Account } from "@/lib/types";

const FIELDS: [keyof ColumnMapping, string, boolean][] = [
  ["date", "Datum", true],
  ["description", "Bezeichnung", true],
  ["amount", "Betrag (eine Spalte)", false],
  ["debit", "Belastung", false],
  ["credit", "Gutschrift", false],
  ["counterparty", "Gegenpartei", false],
];

type Mode =
  | { kind: "none" }
  | { kind: "statement"; result: StatementResult; fileName: string }
  | { kind: "csv"; rows: string[][]; notes: string[]; fileName: string };

export function CsvImport({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [encoding, setEncoding] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOutcome(null);
    const { text, encoding: enc } = decodeBytes(await file.arrayBuffer());
    setEncoding(enc);

    if (looksLikeStatement(text)) {
      setMode({ kind: "statement", result: parseStatement(text), fileName: file.name });
      setMapping(null);
      return;
    }

    const rows = parseCsv(text);
    if (rows.length === 0) {
      setMode({ kind: "csv", rows: [], notes: ["Die Datei ist leer."], fileName: file.name });
      return;
    }
    const sniff = sniffMapping(rows);
    setHasHeader(sniff.hasHeader);
    setMapping(sniff.mapping);
    setMode({ kind: "csv", rows, notes: sniff.notes, fileName: file.name });
  }

  const csvPreview: MapResult | null = useMemo(() => {
    if (mode.kind !== "csv" || !mapping || mode.rows.length === 0) return null;
    return mapRows(mode.rows, mapping, hasHeader);
  }, [mode, mapping, hasHeader]);

  const readyRows =
    mode.kind === "statement" ? mode.result.rows : csvPreview?.ok ?? [];

  async function submit() {
    if (readyRows.length === 0) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("rows", JSON.stringify(readyRows));
    fd.set("account_id", accountId);
    let result: ImportOutcome;
    try {
      result = await importTransactions(fd);
    } catch (e) {
      result = {
        inserted: 0, duplicates: 0, received: readyRows.length,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    setBusy(false);
    setOutcome(result);
    if (!result.error) {
      setMode({ kind: "none" });
      setMapping(null);
      router.refresh();
    }
  }

  const header = mode.kind === "csv" ? mode.rows[0] ?? [] : [];
  const columnOptions = header.map((h, i) => ({
    value: i,
    label: `${i + 1}. ${hasHeader ? h || "(leer)" : `Spalte ${i + 1}`}`,
  }));

  return (
    <Card>
      <CardTitle>Bankauszug importieren</CardTitle>

      <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile}
        className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0
                   file:bg-sand file:px-3 file:py-2 file:text-sm file:text-ink-soft
                   hover:file:bg-line" />

      {outcome && !outcome.error && (
        <div className="mt-3 rounded-xl bg-good-tint p-3 text-sm text-good">
          <p className="font-medium">{outcome.inserted} Buchungen importiert.</p>
          {outcome.duplicates > 0 && (
            <p className="mt-0.5">
              {outcome.duplicates} waren bereits erfasst und wurden übersprungen.
            </p>
          )}
        </div>
      )}

      {outcome?.error && (
        <div className="mt-3 rounded-xl bg-bad-tint p-3 text-sm text-bad">
          <p className="font-medium">Der Import ist fehlgeschlagen.</p>
          <p className="mt-1 break-words font-mono text-xs">{outcome.error}</p>
          {outcome.inserted > 0 && (
            <p className="mt-1">
              {outcome.inserted} von {outcome.received} Buchungen waren bereits
              geschrieben, bevor der Fehler auftrat.
            </p>
          )}
        </div>
      )}

      {/* ---------------- Kontoauszug im Festbreiten-Format ---------------- */}
      {mode.kind === "statement" && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Kontoauszug erkannt</Badge>
            <span className="text-sm text-ink-soft">
              {mode.result.pages} Seiten · {mode.result.rows.length} Buchungen
            </span>
          </div>

          <div className="rounded-xl bg-sand/60 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
              Gegenrechnung
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Belastungen</dt>
                <dd className="tabular text-ink">{chf2(mode.result.sumDebit)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Gutschriften</dt>
                <dd className="tabular text-ink">{chf2(mode.result.sumCredit)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-1.5">
                <dt className="text-ink-soft">Saldo im Zeitraum</dt>
                <dd className={cx("tabular font-medium",
                  mode.result.sumCredit - mode.result.sumDebit >= 0 ? "text-good" : "text-bad")}>
                  {chf2(mode.result.sumCredit - mode.result.sumDebit)}
                </dd>
              </div>
            </dl>
            {mode.result.balanced === true && (
              <p className="mt-3 text-sm text-good">
                Stimmt auf den Rappen mit den Totalen überein, die der Auszug selbst nennt.
              </p>
            )}
            {mode.result.balanced === false && (
              <p className="mt-3 text-sm text-warn">{mode.result.warnings[0]}</p>
            )}
          </div>

          {mode.result.transferCount > 0 && (
            <p className="text-sm text-ink-muted">
              {mode.result.transferCount} Überträge auf deine eigenen Konten werden als
              Umbuchung markiert. Sie erscheinen im Verlauf, zählen aber nicht als Ausgabe —
              sonst würde dein Sparen wie Konsum aussehen.
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2">
              <CardTitle className="mb-0">Vorschau</CardTitle>
              <Badge tone="good">{mode.result.rows.length} Buchungen</Badge>
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {mode.result.rows.slice(0, 8).map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <span className="tabular w-20 shrink-0 text-xs text-ink-muted">
                    {dateLabel(r.occurred_on)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                    {r.description || "—"}
                  </span>
                  {r.is_transfer && <Badge>Umbuchung</Badge>}
                  <span className={cx("tabular shrink-0 text-sm",
                    r.amount >= 0 ? "text-good" : "text-ink-soft")}>
                    {r.amount >= 0 ? "+" : ""}{chf2(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ---------------- Echtes CSV mit Spalten ---------------- */}
      {mode.kind === "csv" && mode.rows.length > 0 && mapping && (
        <div className="mt-5 space-y-5">
          {encoding === "Windows-1252" && (
            <p className="rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink-muted">
              Die Datei ist Windows-1252 kodiert — Umlaute werden entsprechend gelesen.
            </p>
          )}

          {mode.notes.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-warn-tint p-3 text-sm text-warn">
              {mode.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="h-4 w-4 rounded border-line" />
            Erste Zeile ist die Kopfzeile
          </label>

          <div>
            <CardTitle>Spalten zuordnen</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map(([key, label, required]) => (
                <div key={key}>
                  <Label htmlFor={`map-${key}`}>
                    {label} {required && <span className="text-bad">*</span>}
                  </Label>
                  <Select id={`map-${key}`} value={mapping[key]}
                    onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}>
                    <option value={-1}>— nicht verwenden —</option>
                    {columnOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Entweder eine Betrags-Spalte oder Belastung und Gutschrift getrennt.
            </p>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle className="mb-0">Vorschau</CardTitle>
              <Badge tone="good">{csvPreview?.ok.length ?? 0} erkannt</Badge>
              {(csvPreview?.skipped ?? 0) > 0 && (
                <Badge tone="warn">{csvPreview?.skipped} übersprungen</Badge>
              )}
            </div>

            {csvPreview && csvPreview.ok.length > 0 ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {csvPreview.ok.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="tabular w-20 shrink-0 text-xs text-ink-muted">
                      {dateLabel(r.occurred_on)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      {r.description || "—"}
                    </span>
                    {r.is_transfer && <Badge>Umbuchung</Badge>}
                    <span className={cx("tabular shrink-0 text-sm",
                      r.amount >= 0 ? "text-good" : "text-ink-soft")}>
                      {r.amount >= 0 ? "+" : ""}{chf2(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Keine Zeile verwertbar.</Empty>
            )}

            {csvPreview && csvPreview.skipped > 0 && (
              <div className="mt-3 rounded-xl bg-sand/60 p-3">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Warum übersprungen
                </div>
                <ul className="space-y-0.5 text-sm text-ink-soft">
                  {Object.entries(csvPreview.reasons)
                    .filter(([, n]) => n > 0)
                    .map(([reason, n]) => <li key={reason}>{n}× {reason}</li>)}
                </ul>
                {csvPreview.samples.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {csvPreview.samples.slice(0, 3).map((s, i) => (
                      <code key={i} className="block truncate text-xs text-ink-faint">
                        {s.row.join(" | ").slice(0, 110)}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode.kind === "csv" && mode.rows.length === 0 && (
        <div className="mt-5">
          <Empty>{mode.notes[0] ?? "Die Datei konnte nicht gelesen werden."}</Empty>
        </div>
      )}

      {readyRows.length > 0 && (
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
          <div className="min-w-48">
            <Label htmlFor="acc">Auf welches Konto?</Label>
            <Select id="acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— keines —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Importiere…" : `${readyRows.length} Buchungen importieren`}
          </Button>
        </div>
      )}
    </Card>
  );
}
