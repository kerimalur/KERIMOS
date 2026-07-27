"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetMoney, resetTime, type ResetCounts } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, cx } from "@/components/ui";

interface Item { key: string; label: string; hint: string; countKey: string }

const GELD: Item[] = [
  { key: "transactions", label: "Buchungen", countKey: "transactions",
    hint: "Alle importierten und erfassten Transaktionen" },
  { key: "accounts", label: "Konten", countKey: "accounts",
    hint: "Löscht zwingend auch die Buchungen — ohne Konto ergibt ein Saldo keinen Sinn" },
  { key: "recurring", label: "Fixkosten", countKey: "recurring_items",
    hint: "Wiederkehrende Posten" },
  { key: "rules", label: "Import-Regeln", countKey: "import_rules",
    hint: "Die Zuordnungen wie „coop → Lebensmittel“" },
  { key: "scenarios", label: "Szenarien", countKey: "scenarios",
    hint: "Gespeicherte Runway-Szenarien" },
  { key: "categories", label: "Kategorien", countKey: "categories",
    hint: "Löscht zwingend auch die Import-Regeln, die darauf zeigen" },
];

const ZEIT: Item[] = [
  { key: "entries", label: "Zeiteinträge", countKey: "time_entries",
    hint: "Alle erfassten Blöcke im Kalender" },
  { key: "checkins", label: "Tages-Notizen", countKey: "day_checkins",
    hint: "Energie, Schlafdauer und Notizen" },
  { key: "reviews", label: "Wochen-Rückblicke", countKey: "weekly_reviews",
    hint: "Eingefrorene Wochenkennzahlen" },
  { key: "activities", label: "Aktivitäten", countKey: "activities",
    hint: "Löscht zwingend auch alle Zeiteinträge" },
];

export function ResetPanel({ counts }: { counts: ResetCounts }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Geld zurücksetzen" items={GELD} counts={counts} kind="money"
        note="Betrifft ausschliesslich den Geld-Bereich. Deine Zeitdaten bleiben unberührt." />
      <Section title="Zeit zurücksetzen" items={ZEIT} counts={counts} kind="time"
        note="Betrifft ausschliesslich den Zeit-Bereich. Deine Buchungen bleiben unberührt." />
    </div>
  );
}

function Section({
  title, items, counts, kind, note,
}: {
  title: string; items: Item[]; counts: ResetCounts;
  kind: "money" | "time"; note: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = selected.size > 0 && confirm.trim().toUpperCase() === "LOESCHEN";
  const affected = items
    .filter((i) => selected.has(i.key))
    .reduce((sum, i) => sum + Number(counts[i.countKey] ?? 0), 0);

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setResult(null); setError(null);
  }

  async function run() {
    if (!ready) return;
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("confirm", confirm);
    for (const item of items) if (selected.has(item.key)) fd.set(item.key, "on");
    try {
      const res = kind === "money" ? await resetMoney(fd) : await resetTime(fd);
      setResult(res);
      setSelected(new Set());
      setConfirm("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mb-4 text-sm text-ink-muted">{note}</p>

      <ul className="space-y-2">
        {items.map((i) => {
          const n = Number(counts[i.countKey] ?? 0);
          return (
            <li key={i.key}>
              <label className={cx(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                selected.has(i.key) ? "border-bad/50 bg-bad-tint" : "border-line hover:border-line-strong",
                n === 0 && "opacity-50"
              )}>
                <input type="checkbox" checked={selected.has(i.key)}
                  onChange={() => toggle(i.key)} disabled={n === 0}
                  className="mt-0.5 h-4 w-4 rounded border-line" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">{i.label}</span>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {n} {n === 1 ? "Eintrag" : "Einträge"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{i.hint}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-line pt-4">
        <Label htmlFor={`confirm-${kind}`}>
          Zum Bestätigen <span className="font-medium text-ink">LOESCHEN</span> eintippen
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id={`confirm-${kind}`} value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="LOESCHEN" className="w-40" autoComplete="off" />
          <Button variant="danger" onClick={run} disabled={!ready || busy}>
            {busy ? "Lösche…" : selected.size === 0
              ? "Nichts gewählt"
              : `${affected} Einträge löschen`}
          </Button>
        </div>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}

        {result && Object.keys(result).length > 0 && (
          <div className="mt-3 rounded-xl bg-good-tint p-3 text-sm text-good">
            <p className="font-medium">Gelöscht:</p>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(result).map(([table, n]) => (
                <li key={table}>{n} × {table}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
