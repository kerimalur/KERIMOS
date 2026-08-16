import { fetchWeekEvents, type EconEvent } from "@/lib/supabase/trading";
import { Card, CardTitle, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Wirtschaftskalender — die High-Impact-Termine dieser Woche.
 *
 * Stand vorher zweimal im Haus: „diese Woche" auf der Übersicht, „heute" im
 * Cockpit. Zwei Listen derselben Tabelle an zwei Orten, und keine von beiden
 * war vollständig. Jetzt eine Seite, heute hervorgehoben.
 *
 * Nutzen im Alltag: Ein Termin ist kein Signal, aber ein Grund, eine halbe
 * Stunde nicht einzusteigen — und die beste Gelegenheit, live zu sehen, was
 * Zahlen mit dem Markt machen.
 */

const CH_TIME = { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" } as const;

function zeilenStil(erledigt: boolean, tagVorbei: boolean): string {
  return tagVorbei || erledigt ? "text-xs text-ink-faint" : "text-xs text-ink-soft";
}

export default async function NewsSeite() {
  const events = await fetchWeekEvents();

  const heute = new Date().toDateString();
  const proTag = new Map<string, EconEvent[]>();
  for (const e of events) {
    const key = new Date(e.event_time).toDateString();
    const list = proTag.get(key) ?? [];
    list.push(e);
    proTag.set(key, list);
  }

  const heutige = proTag.get(heute) ?? [];
  const offenHeute = heutige.filter((e) => new Date(e.event_time) > new Date());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">News</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          High-Impact-Termine dieser Woche.{" "}
          {offenHeute.length > 0
            ? `Heute stehen noch ${offenHeute.length} aus.`
            : heutige.length > 0
              ? "Heute ist alles durch."
              : "Heute steht nichts an."}
        </p>
      </div>

      <Card>
        <CardTitle>Diese Woche</CardTitle>
        {events.length === 0 ? (
          <Empty>Diese Woche stehen keine High-Impact-Termine an.</Empty>
        ) : (
          <div className="space-y-2.5">
            {[...proTag.entries()].map(([tag, list]) => {
              const istHeute = tag === heute;
              const vorbei = new Date(list[0].event_time).setHours(23, 59) < Date.now() && !istHeute;
              return (
                <div key={tag}
                  className={istHeute
                    ? "rounded-xl border border-accent bg-accent-tint px-3 py-2.5"
                    : "px-3"}>
                  <div className={istHeute
                    ? "mb-1.5 text-xs font-medium uppercase tracking-wide text-accent-soft"
                    : "mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted"}>
                    {new Date(list[0].event_time).toLocaleDateString("de-CH",
                      { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Zurich" })}
                    {istHeute && " · heute"}
                  </div>
                  <ul className="space-y-1">
                    {list.map((e, i) => {
                      const erledigt = new Date(e.event_time) < new Date();
                      return (
                        <li key={i} className={zeilenStil(erledigt, vorbei)}>
                          <span className="tabular font-medium">
                            {new Date(e.event_time).toLocaleTimeString("de-CH", CH_TIME)}
                          </span>
                          {e.currency && <span className="ml-1.5 font-medium">{e.currency}</span>}
                          <span className="ml-1.5">{e.title}</span>
                          {erledigt && e.actual && (
                            <span className="ml-1.5 text-ink-muted">
                              → {e.actual}{e.forecast ? ` (erw. ${e.forecast})` : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Wofür das gut ist</CardTitle>
        <p className="text-sm leading-relaxed text-ink-soft">
          Setz dich einmal im Monat zu <strong>einem</strong> dieser Termine dazu —
          US-CPI oder ein Zentralbank-Entscheid, dreissig Minuten, Chart offen,
          nichts handeln. Was in dieser halben Stunde passiert, verstehst du
          danach körperlich; kein Text bringt das. Nach acht bis zehn solchen
          Terminen liest du diese Liste anders.
        </p>
      </Card>
    </div>
  );
}
