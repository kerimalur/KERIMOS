"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { einschaetzungSpeichern } from "@/lib/wochenideen-actions";

/**
 * Kerims eigene Einschätzung zu einer Wochenidee: antippen statt tippen,
 * dazu ein Textfeld mit Bausteinen. Die Auswahl ist auswertbar („liegt mein
 * Bauchgefühl besser als das Urteil?"), der Text ist für ihn selbst.
 */
const WAHL = [
  { key: "zustimmen", label: "Stimme zu", ton: "bg-good-tint text-good-bright" },
  { key: "zweifel", label: "Zweifel", ton: "bg-warn-tint text-accent-soft" },
  { key: "dagegen", label: "Dagegen", ton: "bg-bad-tint text-bad-bright" },
] as const;

const BAUSTEINE = [
  "Passt zur GVA",
  "Chart widerspricht",
  "Schon weit gelaufen",
  "Zinsentscheid diese Woche – abwarten",
  "News-Risiko (NFP/CPI)",
  "Risk-Regime spricht dagegen",
];

export function EinschaetzungForm({ id, wert, notiz }: {
  id: string; wert: string | null; notiz: string | null;
}) {
  const [wahl, setWahl] = useState<string | null>(wert);
  const [text, setText] = useState(notiz ?? "");
  const [gespeichert, setGespeichert] = useState(false);
  const geaendert = wahl !== wert || text !== (notiz ?? "");

  return (
    <form action={async (fd) => { await einschaetzungSpeichern(fd); setGespeichert(true); }}
      className="mt-2 space-y-2 border-t border-line/50 pt-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="einschaetzung" value={wahl ?? ""} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-faint">Deine Einschätzung</span>
        {WAHL.map((w) => (
          <button key={w.key} type="button" onClick={() => { setWahl(wahl === w.key ? null : w.key); setGespeichert(false); }}
            className={cx("rounded-lg px-2.5 py-1 text-xs transition",
              wahl === w.key ? cx(w.ton, "font-semibold ring-1 ring-current") : "bg-sand text-ink-muted hover:text-ink")}>
            {w.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {BAUSTEINE.map((b) => (
          <button key={b} type="button"
            onClick={() => { setText((t) => (t ? `${t.replace(/\s+$/, "")} · ${b}` : b)); setGespeichert(false); }}
            className="rounded-md bg-sand/70 px-2 py-0.5 text-[11px] text-ink-muted transition hover:text-ink">
            + {b}
          </button>
        ))}
      </div>
      <textarea name="notiz" value={text} rows={2} maxLength={1000}
        onChange={(e) => { setText(e.target.value); setGespeichert(false); }}
        placeholder="Warum? (optional)"
        className="w-full rounded-lg border border-line bg-paper/60 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!geaendert}
          className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-ink-on transition disabled:opacity-40">
          Speichern
        </button>
        {gespeichert && !geaendert && <span className="text-[11px] text-good-bright">gespeichert</span>}
      </div>
    </form>
  );
}
