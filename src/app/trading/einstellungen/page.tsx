import Link from "next/link";
import { ladeEinstellungen } from "@/lib/alarm/einstellungen";
import { telegramKonfiguriert } from "@/lib/alarm/kanaele";
import { warnungen, inRuhezeit, ART_LABEL } from "@/lib/alarm/regeln";
import { pushConfigured } from "@/lib/push";
import { tradingConfigured, fetchWatchlist } from "@/lib/supabase/trading";
import { heuteMinuten } from "@/lib/time";
import { KategorienKarte } from "@/components/trading/kategorien-karte";
import { KonfluenzenKarte } from "@/components/trading/konfluenzen-karte";
import { AlarmUebersichtKarte } from "@/components/alarm/uebersicht-karte";
import { ladeAlarmUebersicht } from "@/lib/alarm/uebersicht";
import { Card, CardTitle, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Einstellungen — alles, was man einmal einrichtet und danach selten anfasst.
 *
 * War zwischenzeitlich nach `/einstellungen/trading` ausgelagert, als es eine
 * gemeinsame Einstellungsseite für alle Bereiche gab. Seit dem Radikalschnitt
 * vom 09.09.2026 besteht KerimOS nur noch aus Trading und Essen — eine Seite,
 * die nach Bereichen aufteilt, hätte zwei Reiter und keinen Zweck. Also
 * zurück dorthin, wo sie gebraucht wird.
 */

function Kachel({
  href, titel, text, extern,
}: { href: string; titel: string; text: string; extern?: boolean }) {
  const inhalt = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-ink">{titel}</span>
        <span className="text-xs text-ink-faint transition group-hover:text-accent-soft">
          {extern ? "↗" : "→"}
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{text}</p>
    </>
  );
  const klasse =
    "group rounded-2xl border border-line/70 bg-card px-4 py-3 shadow-card " +
    "transition duration-150 ease-tactile hover:border-line-strong active:scale-[0.98]";

  return extern
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={klasse}>{inhalt}</a>
    : <Link href={href} className={klasse}>{inhalt}</Link>;
}

export default async function TradingEinstellungenPage() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Einstellungen</CardTitle>
        <Empty>Trading-Datenbank nicht verbunden.</Empty>
      </Card>
    );
  }

  const [{ werte, quelle }, linien, alarmZeilen] = await Promise.all([
    ladeEinstellungen(), fetchWatchlist(), ladeAlarmUebersicht(),
  ]);
  const ruhtGerade = inRuhezeit(heuteMinuten(), werte.ruhe_von, werte.ruhe_bis);
  const probleme = warnungen(werte);
  const mitAlarm = linien.filter(
    (l) => l.alarm_on_hit || l.alarm_time !== null,
  ).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Einstellungen</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Alarme, Kategorien, Kanäle und der Weg ins Labor.
        </p>
      </div>

      <Card>
        <CardTitle>Alarm-Zustand</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={werte.push_an ? "good" : "neutral"}>
            Push {werte.push_an ? "an" : "aus"}
          </Badge>
          <Badge tone={werte.telegram_an ? (telegramKonfiguriert() ? "good" : "bad") : "neutral"}>
            Telegram {werte.telegram_an ? (telegramKonfiguriert() ? "an" : "an, Token fehlt") : "aus"}
          </Badge>
          <Badge tone={pushConfigured() ? "good" : werte.push_an ? "bad" : "neutral"}>
            VAPID {pushConfigured() ? "gesetzt" : "fehlt"}
          </Badge>
          <Badge tone={quelle === "db" ? "good" : "warn"}>
            {quelle === "db" ? "gespeicherte Einstellungen" : "Standardwerte"}
          </Badge>
          {ruhtGerade && <Badge tone="warn">Ruhezeit läuft</Badge>}
          <Badge tone={werte.arten.length === 3 ? "good" : "warn"}>
            {werte.arten.length === 3
              ? "alle Arten"
              : `nur ${werte.arten.map((a) => ART_LABEL[a]).join(", ") || "nichts"}`}
          </Badge>
          <Badge tone={mitAlarm > 0 ? "good" : "neutral"}>
            {mitAlarm} von {linien.length} Linien scharf
          </Badge>
        </div>
        {probleme.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line/70 pt-3 text-xs text-ink-soft">
            {probleme.map((p) => <li key={p}>· {p}</li>)}
          </ul>
        )}
      </Card>

      {/* Steht VOR den Kacheln: „was meldet demnächst" ist die Frage, mit
          der man diese Seite öffnet, seit die Alarme einmalig sind. */}
      <AlarmUebersichtKarte zeilen={alarmZeilen} />

      <KategorienKarte />

      <KonfluenzenKarte />

      <div className="grid gap-2 sm:grid-cols-2">
        <Kachel href="/trading/alarme/einstellungen" titel="Alarm-Setup"
          text="Kanäle, Chat-ID, Ruhezeit, Paarliste, Tagesgrenze — und der Testknopf." />
        <Kachel href="/trading/alarme" titel="Alarme je Linie"
          text="Level, Vorwarnung in Pips und Uhrzeit für jede einzelne GVA-Linie." />
        <Kachel href="/trading/journal/konten" titel="Konten"
          text="Kontostände, Ein- und Auszahlungen." />
        <Kachel href="https://gva-screener-kerim-alurs-projects.vercel.app" extern
          titel="Labor" text="ML, Quant-Strategien und die Fundamentaldaten-Werkstatt. Ruht gerade." />
      </div>

      <Card>
        <CardTitle>Warum der Screener bleiben muss</CardTitle>
        <p className="text-sm leading-relaxed text-ink-soft">
          Das Labor sieht man nie wieder an — die Jobs dahinter laufen aber
          weiter und sind die Grundlage von Confluence und Cockpit: zwei
          Cron-Läufe im Screener-Frontend füllen täglich Zinsen, Inflation,
          COT und die Kurse für das Risiko-Regime, das Render-Backend liefert
          GVA-Erkennung und Live-Preise für die Alarme. Beide Deployments
          bleiben also stehen; abgeschaltet würde diese App still auf dem
          letzten Stand einfrieren.
        </p>
      </Card>
    </div>
  );
}
