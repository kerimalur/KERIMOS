"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, Input, cx } from "@/components/ui";
import { RESULT_LABEL } from "@/lib/backtest-types";

/**
 * Filter für die pair-übergreifende Auswertung. Alles läuft über die URL,
 * damit ein bestimmter Blick auf die Daten teilbar und beim Zurücknavigieren
 * erhalten ist - gleiches Muster wie der Filter auf /transaktionen.
 */
export function BacktestFilter({
  pairs, gvaTypen, confluences, heute,
}: {
  pairs: string[];
  gvaTypen: string[];
  confluences: string[];
  heute: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/trading/backtest/auswertung?${next.toString()}`);
  }

  function setRange(von: string | null, bis: string | null) {
    const next = new URLSearchParams(params.toString());
    if (von) next.set("von", von); else next.delete("von");
    if (bis) next.set("bis", bis); else next.delete("bis");
    router.push(`/trading/backtest/auswertung?${next.toString()}`);
  }

  const jahr = heute.slice(0, 4);
  const jahresanfang = `${jahr}-01-01`;
  const istJahr = get("von") === jahresanfang && get("bis") === heute;
  const istAlle = !get("von") && !get("bis");
  const aktiv = ["pair", "gva", "confluence", "richtung", "ergebnis", "status", "von", "bis"]
    .some((k) => get(k));

  const presetClass = (an: boolean) =>
    cx("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
      an ? "border-accent/60 bg-accent-tint text-accent-soft"
        : "border-line bg-field text-ink-muted hover:border-line-strong hover:text-ink-soft");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={presetClass(istAlle)}
          onClick={() => setRange(null, null)}>
          Alle Zeit
        </button>
        <button type="button" className={presetClass(istJahr)}
          onClick={() => setRange(jahresanfang, heute)}>
          {jahr}
        </button>
        <span className="mx-1 text-xs text-ink-faint">oder</span>
        <Input type="date" value={get("von")} onChange={(e) => update("von", e.target.value)}
          className="w-36" aria-label="Von" />
        <span className="text-xs text-ink-faint">bis</span>
        <Input type="date" value={get("bis")} onChange={(e) => update("bis", e.target.value)}
          className="w-36" aria-label="Bis" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select value={get("pair")} onChange={(e) => update("pair", e.target.value)}
          className="w-36" aria-label="Pair">
          <option value="">Alle Pairs</option>
          {pairs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>

        <Select value={get("status")} onChange={(e) => update("status", e.target.value)}
          className="w-44" aria-label="Session-Status">
          <option value="">Alle Sessions</option>
          <option value="aktiv">Nur offene Sessions</option>
          <option value="abgeschlossen">Nur abgeschlossene</option>
        </Select>

        <Select value={get("gva")} onChange={(e) => update("gva", e.target.value)}
          className="w-40" aria-label="GVA-Typ">
          <option value="">Alle GVA-Typen</option>
          {gvaTypen.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>

        <Select value={get("confluence")} onChange={(e) => update("confluence", e.target.value)}
          className="w-44" aria-label="Confluence">
          <option value="">Alle Confluences</option>
          {confluences.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>

        <Select value={get("richtung")} onChange={(e) => update("richtung", e.target.value)}
          className="w-32" aria-label="Richtung">
          <option value="">Beide Seiten</option>
          <option value="long">Nur Long</option>
          <option value="short">Nur Short</option>
        </Select>

        <Select value={get("ergebnis")} onChange={(e) => update("ergebnis", e.target.value)}
          className="w-44" aria-label="Ergebnis">
          <option value="">Alle Ergebnisse</option>
          <option value="ohne_skip">Ohne Skips</option>
          {Object.entries(RESULT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>Nur {l}</option>
          ))}
        </Select>

        {aktiv && (
          <button onClick={() => router.push("/trading/backtest/auswertung")}
            className="px-1 text-xs text-ink-muted transition hover:text-ink-soft">
            Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
