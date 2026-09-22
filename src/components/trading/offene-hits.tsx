import Link from "next/link";
import { fetchSignale, type Signal } from "@/lib/trading/journal";
import { fetchWatchlist, tradingConfigured } from "@/lib/supabase/trading";
import { signalUebernehmen, signalVerwerfen } from "@/lib/journal-actions";
import { Card, CardTitle, Badge } from "@/components/ui";

const sauber = (p: string) => p.replace(/[^A-Za-z]/g, "").toUpperCase();

/** "vor 12 min" · "vor 3 h" · "vor 2 Tagen" */
function wieLange(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(min)) return "";
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

/**
 * GVA-Hits, die auf eine Entscheidung warten — auf der Startseite.
 *
 * Seit 22.09.2026. Gezeigt wird genau das, was im Cockpit gelb markiert ist:
 * je Paar das jüngste Signal mit Status „new", das noch nicht in den aktiven
 * Trades steht. Wird ein Hit aktiv genommen oder verworfen, verschwindet er
 * hier von selbst — beide Aktionen setzen den Status und laden „/" neu.
 *
 * Die Knöpfe sind dieselben Aktionen wie im Cockpit-Popup. Wer vorher den
 * Chart und die Lage sehen will, kommt über „ansehen" direkt ins Popup.
 *
 * Steht nichts an, verschwindet die Karte ganz.
 */
export async function OffeneHits() {
  if (!tradingConfigured()) return null;

  const [signale, aktive] = await Promise.all([fetchSignale(["new"]), fetchWatchlist()]);

  const inListe = (s: Signal) => aktive.some((w) =>
    sauber(w.pair) === sauber(s.pair) && w.line_level !== null
    && Math.abs(w.line_level - s.lineLevel) < Math.max(1e-6, Math.abs(s.lineLevel) * 1e-5));

  // fetchSignale liefert absteigend nach hit_at → erstes je Paar ist das jüngste.
  const jePaar = new Map<string, Signal>();
  for (const s of signale) {
    const k = sauber(s.pair);
    if (!jePaar.has(k)) jePaar.set(k, s);
  }
  const offen = [...jePaar.values()].filter((s) => !inListe(s));
  if (offen.length === 0) return null;

  return (
    <Card area="trading">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">
          {offen.length === 1 ? "1 GVA-Hit wartet" : `${offen.length} GVA-Hits warten`}
        </CardTitle>
        <Link href="/trading/cockpit" className="text-xs text-accent-soft hover:underline">
          Cockpit →
        </Link>
      </div>

      <ul className="space-y-2">
        {offen.map((s) => {
          const paar = sauber(s.pair);
          const nachkomma = paar.includes("JPY") ? 3 : 5;
          const felder = (
            <>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="pair" value={paar} />
              <input type="hidden" name="lineType" value={s.lineType} />
              <input type="hidden" name="lineLevel" value={String(s.lineLevel)} />
              {s.lineFormedDate && (
                <input type="hidden" name="formiert" value={s.lineFormedDate} />
              )}
            </>
          );
          return (
            <li key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card/60 px-3 py-2.5">
              <span className="w-[72px] font-display text-sm font-bold text-ink">{paar}</span>
              <Badge tone={s.lineType === "long" ? "good" : "bad"}>
                {s.lineType === "long" ? "Long" : "Short"}
              </Badge>
              <span className="tabular text-xs text-ink-soft">
                {s.lineLevel.toFixed(nachkomma)}
              </span>
              <span className="text-xs text-ink-faint">{wieLange(s.hitAt)}</span>

              <div className="ml-auto flex items-center gap-2">
                <Link href={`/trading/cockpit?paar=${paar}`}
                  className="rounded-lg px-2 py-1 text-xs text-ink-muted transition hover:text-ink">
                  ansehen
                </Link>
                <form action={signalVerwerfen}>
                  {felder}
                  <button className="rounded-lg border border-line bg-sand px-2.5 py-1 text-xs
                                     text-ink-soft transition hover:text-bad-bright active:scale-95">
                    verwerfen
                  </button>
                </form>
                <form action={signalUebernehmen}>
                  {felder}
                  <button className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium
                                     text-ink-on transition hover:bg-accent-soft active:scale-95">
                    aktiv nehmen
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
