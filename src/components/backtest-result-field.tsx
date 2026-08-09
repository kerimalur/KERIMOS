"use client";
import { useState } from "react";
import { Select, Label } from "@/components/ui";
import { RESULT_LABEL, type BacktestCategory } from "@/lib/backtest-types";

/**
 * Ergebnis-Auswahl + Skip-Grund. Eigene Client-Komponente nur für diesen
 * einen Zweig: der Skip-Grund ergibt nur Sinn, wenn Ergebnis = Skip - alles
 * andere im Trade-Formular bleibt normales serverseitiges Markup im selben
 * <form>, dessen action direkt auf addBacktestTrade zeigt.
 */
export function BacktestResultField({ skipGrund }: { skipGrund: BacktestCategory | null }) {
  const [result, setResult] = useState<string>("full_tp");
  const istSkip = result === "skip";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="result">Ergebnis</Label>
        <Select id="result" name="result" value={result}
          onChange={(e) => setResult(e.target.value)}>
          {Object.entries(RESULT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>
      {istSkip && skipGrund && (
        <div>
          <Label htmlFor="skip_grund_select">Skip-Grund</Label>
          <Select id="skip_grund_select" name="skip_grund">
            <option value="">— wählen —</option>
            {skipGrund.tags.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
