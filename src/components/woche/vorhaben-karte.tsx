import {
  vorhabenAnlegen, vorhabenLoeschen, vorhabenSchritt, vorhabenStatus,
} from "@/lib/woche-actions";
import { Card, CardTitle, Input, Select, Button, cx } from "@/components/ui";
import { MAX_AKTIV } from "@/lib/woche-typen";
import type { Vorhaben } from "@/lib/woche";

function StatusKnopf({ id, status, children, gefahr }: {
  id: string; status: string; children: React.ReactNode; gefahr?: boolean;
}) {
  return (
    <form action={vorhabenStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={cx("text-xs transition",
        gefahr ? "text-ink-faint hover:text-bad" : "text-accent-soft hover:underline")}>
        {children}
      </button>
    </form>
  );
}

/**
 * Freie Zeit — woran arbeite ich?
 *
 * Die Antwort auf „ich habe heute zwei Stunden, was mache ich?". Höchstens
 * drei Vorhaben sind aktiv, jedes mit genau einem nächsten Schritt. Der
 * nächste Schritt ist der Kern: ein Vorhaben ohne ihn ist eine Idee, und vor
 * einer Idee sitzt man, statt anzufangen.
 *
 * Alles andere steht bei den Ideen und wartet, bis ein Platz frei wird.
 */
export function VorhabenKarte({ vorhaben }: { vorhaben: Vorhaben[] }) {
  const aktiv = vorhaben.filter((v) => v.status === "aktiv");
  const ideen = vorhaben.filter((v) => v.status === "idee");
  const erledigt = vorhaben.filter((v) => v.status === "erledigt")
    .sort((a, b) => String(b.erledigtAm).localeCompare(String(a.erledigtAm)));
  const platzFrei = aktiv.length < MAX_AKTIV;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Freie Zeit — woran arbeite ich?</CardTitle>
        <span className="text-xs text-ink-faint">{aktiv.length} / {MAX_AKTIV} aktiv</span>
      </div>

      {aktiv.length === 0 ? (
        <p className="mb-4 text-sm text-ink-muted">
          Noch nichts aktiv. Leg unten ein Vorhaben an — mit einem nächsten
          Schritt, den du ohne Nachdenken anfangen kannst.
        </p>
      ) : (
        <ul className="mb-4 grid gap-3 md:grid-cols-3">
          {aktiv.map((v) => (
            <li key={v.id} className="flex flex-col rounded-xl border border-accent/25
                                      bg-accent-tint/30 p-3.5">
              <p className="font-medium text-ink">{v.titel}</p>
              <form action={vorhabenSchritt} className="mt-2 flex-1">
                <input type="hidden" name="id" value={v.id} />
                <label className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  Nächster Schritt
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input name="naechster_schritt" defaultValue={v.naechsterSchritt ?? ""}
                    placeholder="Was genau machst du als Nächstes?"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-field px-2 py-1
                               text-sm text-ink placeholder:text-ink-faint outline-none
                               focus:border-accent" />
                  <button className="rounded-lg border border-line bg-sand px-2 text-xs
                                     text-ink-soft transition hover:text-ink">
                    ✓
                  </button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap gap-3">
                <StatusKnopf id={v.id} status="erledigt">abgeschlossen</StatusKnopf>
                <StatusKnopf id={v.id} status="idee" gefahr>zurückstellen</StatusKnopf>
              </div>
            </li>
          ))}
        </ul>
      )}

      {ideen.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-muted">Ideen</p>
          <ul className="space-y-1">
            {ideen.map((v) => (
              <li key={v.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-sand/50
                           px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-ink-soft">
                  {v.titel}
                  {v.naechsterSchritt && (
                    <span className="ml-2 text-xs text-ink-faint">→ {v.naechsterSchritt}</span>
                  )}
                </span>
                {platzFrei && <StatusKnopf id={v.id} status="aktiv">aktiv setzen</StatusKnopf>}
                <form action={vorhabenLoeschen}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className="text-xs text-ink-faint transition hover:text-bad">weg</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={vorhabenAnlegen}
        className="grid gap-2 border-t border-line/70 pt-4 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Input name="titel" required placeholder="Vorhaben, z.B. Fundamental-Backtest-Pipeline" />
        <Input name="naechster_schritt" placeholder="Nächster Schritt (optional)" />
        <Select name="status" defaultValue={platzFrei ? "aktiv" : "idee"} className="sm:w-28">
          <option value="aktiv">aktiv</option>
          <option value="idee">Idee</option>
        </Select>
        <Button type="submit">Anlegen</Button>
      </form>

      {erledigt.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-soft">
            Abgeschlossen ({erledigt.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {erledigt.map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-ink-faint">
                <span className="flex-1 line-through">{v.titel}</span>
                <StatusKnopf id={v.id} status="idee">wieder öffnen</StatusKnopf>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
