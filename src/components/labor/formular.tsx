"use client";
import { useFormStatus } from "react-dom";
import { starteLaborLauf } from "@/lib/labor-actions";
import type { LaufEinstellung } from "@/lib/strategie/lauf";
import { cx } from "@/components/ui";

/** Einstellungen ändern und einen neuen Durchlauf starten (Strategie-Labor). */

function Knopf() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={cx("min-h-[44px] rounded-xl px-4 text-sm font-semibold transition",
        pending ? "cursor-wait bg-sand text-ink-muted" : "bg-accent text-ink-on hover:bg-accent-deep")}>
      {pending ? "Rechnet … (28 Paare, bis 1–2 Min.)" : "Durchlauf starten"}
    </button>
  );
}

const feld = "w-full rounded-lg border border-line bg-field px-2.5 py-2 text-sm text-ink";

export function LaborFormular({ start }: { start: LaufEinstellung }) {
  return (
    <form action={starteLaborLauf} className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Zeitrahmen für BOS und Einstieg</span>
        <select name="tf" defaultValue={start.tf} className={feld}>
          <option value="1h">1 Stunde</option>
          <option value="4h">4 Stunden</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">BOS bestätigt durch</span>
        <select name="bos" defaultValue={start.bos} className={feld}>
          <option value="schluss">Schlusskurs</option>
          <option value="docht">Docht</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Swing: Kerzen links/rechts</span>
        <input name="swingN" type="number" min={1} max={20} step={1} defaultValue={start.swingN} className={feld} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">H-Überschreitung ohne Bruch (Pips)</span>
        <input name="tolPips" type="number" min={0} max={100} step={0.5} defaultValue={start.tolPips} className={feld} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Frist bis Einstieg (Tage)</span>
        <input name="maxTage" type="number" min={0.5} max={60} step={0.5} defaultValue={start.maxTage} className={feld} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Einstieg bei Fib</span>
        <input name="einstiegFib" type="number" min={0.1} max={0.95} step={0.001} defaultValue={start.einstiegFib} className={feld} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">TP bei Fib</span>
        <input name="tpFib" type="number" min={-5} max={0} step={0.1} defaultValue={start.tpFib} className={feld} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2">
        <input name="dailyOpen" type="checkbox" defaultChecked={start.dailyOpen} className="h-4 w-4" />
        <span className="text-xs text-ink-soft">BOS muss unter/über dem Daily Open geschehen</span>
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Kosten Majors (Pips)</span>
        <input name="kostenMajors" type="number" min={0} max={20} step={0.1} defaultValue={start.kostenMajors} className={feld} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Kosten Crosses (Pips)</span>
        <input name="kostenCrosses" type="number" min={0} max={20} step={0.1} defaultValue={start.kostenCrosses} className={feld} />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-xs text-ink-muted">Name (optional)</span>
        <input name="name" type="text" placeholder="z.B. Swing 3, ohne Daily Open" className={feld} />
      </label>
      <div className="sm:col-span-2 lg:col-span-4"><Knopf /></div>
    </form>
  );
}
