import Link from "next/link";
import { fetchWatchlist, tradingConfigured } from "@/lib/supabase/trading";
import { updateWatchlistAlarm } from "@/lib/trading-actions";
import { pushConfigured } from "@/lib/push";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { telegramKonfiguriert } from "@/lib/alarm/kanaele";
import { warnungen, inRuhezeit, ART_LABEL, normPaar, paarErlaubt } from "@/lib/alarm/regeln";
import { heuteMinuten } from "@/lib/time";
import { PushAnmeldung } from "@/components/push-anmeldung";
import { Card, CardTitle, Input, Label, Button, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Benachrichtigungen je Linie: Level, Vorwarnung, Uhrzeit.
 *
 * Was für ALLE Linien gilt - Kanäle, Ruhezeit, Paarliste, Tagesgrenze -
 * steht unter /trading/alarme/einstellungen. Die Trennung folgt der
 * Änderungshäufigkeit: Linien passt man täglich an, das System zweimal
 * im Jahr.
 */
export default async function AlarmePage() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Alarme</CardTitle>
        <p className="text-sm text-ink-muted">Trading-Datenbank nicht verbunden.</p>
      </Card>
    );
  }

  const [linien, { werte }] = await Promise.all([fetchWatchlist(), ladeEinstellungen()]);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  const ruhtGerade = inRuhezeit(heuteMinuten(), werte.ruhe_von, werte.ruhe_bis);
  const probleme = warnungen(werte);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Alarme</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Benachrichtigungen aufs Handy, wenn der Preis an deine GVA-Linie
          kommt.{" "}
          <Link href="/trading" className="text-accent-soft hover:underline">
            Zurück zu Trading ↗
          </Link>
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={werte.push_an ? "good" : "neutral"}>
              Push {werte.push_an ? "an" : "aus"}
            </Badge>
            <Badge tone={werte.telegram_an ? (telegramKonfiguriert() ? "good" : "bad") : "neutral"}>
              Telegram {werte.telegram_an ? (telegramKonfiguriert() ? "an" : "an, Token fehlt") : "aus"}
            </Badge>
            {ruhtGerade && <Badge tone="warn">Ruhezeit läuft gerade</Badge>}
            {werte.paare.length > 0 && (
              <Badge tone="warn">nur {werte.paare.join(", ")}</Badge>
            )}
            {werte.arten.length < 3 && (
              <Badge tone="warn">
                nur {werte.arten.map((a) => ART_LABEL[a]).join(", ") || "nichts"}
              </Badge>
            )}
          </div>
          <Link href="/trading/alarme/einstellungen"
            className="text-sm text-accent-soft transition hover:underline">
            Einstellungen, Telegram und Testmeldung →
          </Link>
        </div>
        {probleme.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line/70 pt-3 text-xs text-ink-soft">
            {probleme.map((p) => <li key={p}>· {p}</li>)}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Gerät anmelden</CardTitle>
        <PushAnmeldung vapidKey={vapid} />
        {!pushConfigured() && (
          <p className="mt-3 rounded-lg bg-warn-tint px-3 py-2 text-xs text-ink-soft">
            Auf dem Server fehlen noch die VAPID-Schlüssel. In Vercel unter
            Settings → Environment Variables setzen:{" "}
            <code className="rounded bg-sand px-1">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> und{" "}
            <code className="rounded bg-sand px-1">VAPID_PRIVATE_KEY</code>. Solange
            das fehlt, bleibt Telegram der einzige Weg.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>So kommt KerimOS aufs Handy</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>KerimOS auf dem Handy in <strong>Chrome</strong> öffnen.</li>
          <li>Menü (drei Punkte) → <strong>App installieren</strong> bzw.
            „Zum Startbildschirm hinzufügen".</li>
          <li>Die installierte App öffnen, hierher zurück und oben
            <strong> Benachrichtigungen einschalten</strong> drücken.</li>
          <li>In den{" "}
            <Link href="/trading/alarme/einstellungen" className="text-accent-soft hover:underline">
              Einstellungen
            </Link>{" "}
            <strong>Testmeldung senden</strong> drücken — sie geht über jeden
            eingeschalteten Kanal und sagt genau, wo sie ankam.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-faint">
          Die Alarme werden alle 5 Minuten serverseitig geprüft, unabhängig
          davon, ob die App offen ist. Preise kommen vom GVA-Screener; schläft
          der gerade, fällt ein Durchlauf aus und der nächste holt es nach.
        </p>
      </Card>

      <Card>
        <CardTitle>Alarme je Linie</CardTitle>
        {linien.length === 0 ? (
          <Empty>
            Noch keine Linien. Auf{" "}
            <Link href="/trading" className="text-accent-soft hover:underline">/trading</Link>{" "}
            eine anlegen.
          </Empty>
        ) : (
          <ul className="space-y-3">
            {linien.map((l) => {
              // Eine Linie, die wegen der Paarliste nie meldet, sieht sonst
              // genauso aus wie eine, die scharf ist. Das ist der Fehler, den
              // man erst bemerkt, wenn der Alarm ausbleibt.
              const stillGestellt = !paarErlaubt(werte, l.pair);
              return (
                <li key={l.id} className="rounded-xl bg-sand/50 p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{l.pair}</span>
                    {l.side && (
                      <Badge tone={l.side === "long" ? "good" : "bad"}>
                        {l.side.toUpperCase()}
                      </Badge>
                    )}
                    {stillGestellt && (
                      <Badge tone="warn" title={`${normPaar(l.pair)} steht nicht auf der Paarliste in den Einstellungen`}>
                        meldet nicht
                      </Badge>
                    )}
                    {l.note && <span className="text-xs text-ink-muted">{l.note}</span>}
                  </div>

                  <form action={updateWatchlistAlarm}
                    className="flex flex-wrap items-end gap-2.5">
                    <input type="hidden" name="id" value={l.id} />
                    <div>
                      <Label htmlFor={`lvl-${l.id}`}>Linie</Label>
                      <Input id={`lvl-${l.id}`} name="line_level" type="number" step="0.00001"
                        defaultValue={l.line_level ?? ""} className="w-28" />
                    </div>
                    <div>
                      <Label htmlFor={`pips-${l.id}`}>Vorwarnung (Pips)</Label>
                      <Input id={`pips-${l.id}`} name="alarm_pips" type="number" min="0"
                        defaultValue={l.alarm_pips ?? ""} placeholder="leer = aus"
                        className="w-32" />
                    </div>
                    <div>
                      <Label htmlFor={`zeit-${l.id}`}>Uhrzeit</Label>
                      <Input id={`zeit-${l.id}`} name="alarm_time" type="time"
                        defaultValue={l.alarm_time?.slice(0, 5) ?? ""} className="w-28" />
                    </div>
                    <div>
                      <Label htmlFor={`bis-${l.id}`}>Startseite bis</Label>
                      <Input id={`bis-${l.id}`} name="show_until" type="date"
                        defaultValue={l.show_until ?? ""} className="w-36" />
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-ink-soft">
                      <input type="checkbox" name="alarm_on_hit" defaultChecked={l.alarm_on_hit}
                        className="accent-accent" />
                      bei Treffer
                    </label>
                    <Button type="submit" variant="ghost" className="mb-0">Speichern</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
