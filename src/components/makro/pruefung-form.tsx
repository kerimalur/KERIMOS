"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { entscheidPruefen } from "@/lib/makro-actions";
import type { EntscheidPruefung } from "@/lib/makro/releases";

/**
 * Einen Zinsentscheid prüfen (01.10.2026): Beschluss aus der Mitteilung der
 * Notenbank, Stimmen und Ton. Erst damit zählt eine Abweichung von der
 * Erwartung — und ein Halten mit falkenhaftem Ton wird sichtbar.
 */
const TOENE = [
  { key: "falkenhaft", label: "Falkenhaft", ton: "bg-good-tint text-good-bright" },
  { key: "neutral", label: "Neutral", ton: "bg-sand text-ink-soft" },
  { key: "taubenhaft", label: "Taubenhaft", ton: "bg-bad-tint text-bad-bright" },
] as const;

export function PruefungForm({ releaseId, ist, pruefung }: {
  releaseId: string; ist: number | null; pruefung: EntscheidPruefung | null | undefined;
}) {
  const bestaetigt = pruefung?.status === "bestaetigt" ? pruefung : null;
  const [ton, setTon] = useState<string | null>(bestaetigt?.ton ?? null);
  const [gespeichert, setGespeichert] = useState(false);
  const feld = "w-full rounded-lg border border-line bg-paper/60 px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

  return (
    <form action={async (fd) => { await entscheidPruefen(fd); setGespeichert(true); }}
      className="mt-2 space-y-2 rounded-xl bg-sand/50 p-2.5">
      <input type="hidden" name="release_id" value={releaseId} />
      <input type="hidden" name="ton" value={ton ?? ""} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-ink-faint">Beschluss in %
          <input name="ist" defaultValue={ist ?? ""} inputMode="decimal" className={feld} />
        </label>
        <label className="text-[11px] text-ink-faint">Stimmen
          <input name="stimmen" defaultValue={bestaetigt?.stimmen ?? ""} placeholder="6–3" className={feld} />
        </label>
        <label className="col-span-2 text-[11px] text-ink-faint">Quelle
          <input name="quelle" defaultValue={bestaetigt?.quelle ?? ""} placeholder="Link zur Mitteilung" className={feld} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-faint">Ton</span>
        {TOENE.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTon(ton === t.key ? null : t.key); setGespeichert(false); }}
            className={cx("rounded-lg px-2.5 py-1 text-xs transition",
              ton === t.key ? cx(t.ton, "font-semibold ring-1 ring-current") : "bg-sand text-ink-muted hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
      <textarea name="notiz" defaultValue={bestaetigt?.notiz ?? ""} rows={2} maxLength={1000}
        placeholder="Ausblick, Aussagen (optional)" className={feld} />
      <div className="flex items-center gap-2">
        <button type="submit" className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-ink-on">
          {bestaetigt ? "Prüfung aktualisieren" : "Als geprüft speichern"}
        </button>
        {gespeichert && <span className="text-[11px] text-good-bright">gespeichert</span>}
        <span className="text-[10px] text-ink-faint">Alles leer speichern = Prüfung löschen</span>
      </div>
    </form>
  );
}
