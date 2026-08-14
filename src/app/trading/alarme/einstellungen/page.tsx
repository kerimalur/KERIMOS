import Link from "next/link";
import { ladeEinstellungen, MIGRATION_SQL, heuteGesendet } from "@/lib/alarm/einstellungen";
import { warnungen, inRuhezeit, ART_LABEL } from "@/lib/alarm/regeln";
import { telegramKonfiguriert, basisUrl } from "@/lib/alarm/kanaele";
import { pushConfigured } from "@/lib/push";
import { tradingConfigured } from "@/lib/supabase/trading";
import { heuteISO, heuteMinuten } from "@/lib/time";
import { EinstellungenForm } from "@/components/alarm/einstellungen-form";
import { KopierFeld } from "@/components/alarm/kopierfeld";
import { Card, CardTitle, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Alle Stellschrauben des Alarmsystems an einem Ort.
 *
 * Getrennt von `/trading/alarme`, weil dort die einzelnen Linien stehen
 * (Level, Pips, Uhrzeit) und hier das System darüber (Kanäle, Ruhezeit,
 * Grenzen). Das eine ändert man ständig, das andere zweimal im Jahr.
 *
 * Die Seite beantwortet drei Fragen ohne Nachfragen: Was ist eingestellt?
 * Kommt es an? Und wenn nicht — woran liegt es?
 */

function Zeile({ label, wert, ton = "neutral" }: {
  label: string; wert: string; ton?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <Badge tone={ton}>{wert}</Badge>
    </div>
  );
}

export default async function AlarmEinstellungenPage() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Alarm-Einstellungen</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen
          TRADING_SUPABASE_URL und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const heute = heuteISO();
  const [{ werte, quelle, hinweis, tabelleFehlt }, gesendetHeute] = await Promise.all([
    ladeEinstellungen(),
    heuteGesendet(heute),
  ]);

  const telegramMoeglich = telegramKonfiguriert();
  const basis = basisUrl();
  const cronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const jetzt = heuteMinuten();
  const ruhtGerade = inRuhezeit(jetzt, werte.ruhe_von, werte.ruhe_bis);
  const probleme = warnungen(werte);

  const cronUrl = basis
    ? `${basis}/api/gva-alarm?secret=<CRON_SECRET>`
    : "https://<deine-domain>/api/gva-alarm?secret=<CRON_SECRET>";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">Alarm-Einstellungen</h1>
          <Badge tone={werte.push_an ? "good" : "neutral"}>Push {werte.push_an ? "an" : "aus"}</Badge>
          <Badge tone={werte.telegram_an ? (telegramMoeglich ? "good" : "bad") : "neutral"}>
            Telegram {werte.telegram_an ? "an" : "aus"}
          </Badge>
          {ruhtGerade && <Badge tone="warn">Ruhezeit läuft gerade</Badge>}
          {werte.stumm_bis && werte.stumm_bis >= heute && (
            <Badge tone="bad">stumm bis {werte.stumm_bis}</Badge>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Gilt für alle Linien gemeinsam. Level, Pips und Uhrzeit je Linie
          stehen unter{" "}
          <Link href="/trading/alarme" className="text-accent-soft hover:underline">
            Alarme
          </Link>.
        </p>
      </div>

      {tabelleFehlt && (
        <Card>
          <CardTitle>Ein Schritt fehlt noch</CardTitle>
          <p className="text-sm text-ink-soft">
            Die Tabelle <code className="rounded bg-sand px-1">alarm_einstellungen</code> gibt
            es in der Trading-Datenbank noch nicht. Bis dahin läuft alles mit
            den Standardwerten weiter — Speichern schlägt aber fehl. Die SQL
            einmal im Supabase-SQL-Editor des Projekts{" "}
            <code className="rounded bg-sand px-1">bpggwelpuvbkeudrqoiv</code> ausführen:
          </p>
          <div className="mt-3">
            <KopierFeld text={MIGRATION_SQL} />
          </div>
        </Card>
      )}

      {probleme.length > 0 && (
        <Card>
          <CardTitle>Das solltest du wissen</CardTitle>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {probleme.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="text-accent">·</span>{p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Einstellungen</CardTitle>
        <EinstellungenForm werte={werte} telegramMoeglich={telegramMoeglich} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Steht die Kette?</CardTitle>
          <div className="mt-1">
            <Zeile label="Trading-Datenbank" wert="verbunden" ton="good" />
            <Zeile label="Gespeicherte Einstellungen"
              wert={quelle === "db" ? "aus der Datenbank" : "Standardwerte"}
              ton={quelle === "db" ? "good" : "warn"} />
            <Zeile label="VAPID-Schlüssel (Push)"
              wert={pushConfigured() ? "gesetzt" : "fehlen"}
              ton={pushConfigured() ? "good" : werte.push_an ? "bad" : "neutral"} />
            <Zeile label="TELEGRAM_BOT_TOKEN"
              wert={telegramMoeglich ? "gesetzt" : "fehlt"}
              ton={telegramMoeglich ? "good" : werte.telegram_an ? "bad" : "neutral"} />
            <Zeile label="CRON_SECRET"
              wert={cronSecret ? "gesetzt" : "fehlt — Endpoint ist offen"}
              ton={cronSecret ? "good" : "warn"} />
            <Zeile label="Basis-URL für Links"
              wert={basis ?? "unbekannt — Telegram schickt ohne Link"}
              ton={basis ? "good" : "warn"} />
            <Zeile label="Alarme heute" wert={`${gesendetHeute}${werte.max_pro_tag > 0 ? ` von ${werte.max_pro_tag}` : ""}`}
              ton={werte.max_pro_tag > 0 && gesendetHeute >= werte.max_pro_tag ? "bad" : "neutral"} />
          </div>
          {hinweis && <p className="mt-3 text-xs text-ink-faint">{hinweis}</p>}
        </Card>

        <Card>
          <CardTitle>Wie es zusammenhängt</CardTitle>
          <p className="text-sm leading-relaxed text-ink-soft">
            Alle 5 Minuten ruft <strong>cron-job.org</strong> die URL unten auf.
            KerimOS holt die Preise vom GVA-Screener-Backend, vergleicht sie mit
            deinen Linien und schickt, was diese Einstellungen durchlassen.
            Vercels eigener Cron scheidet aus: der Hobby-Plan erlaubt nur einen
            Lauf pro Tag.
          </p>
          <div className="mt-3">
            <KopierFeld text={cronUrl} label="Aufruf-URL" />
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            <code className="rounded bg-sand px-1">&lt;CRON_SECRET&gt;</code> durch den
            Wert aus den Vercel-Umgebungsvariablen ersetzen. Läuft ein Durchgang
            ins Leere, weil das Backend gerade schläft, holt der nächste es nach —
            die Sperre in <code className="rounded bg-sand px-1">alarm_log</code> sorgt
            dafür, dass dieselbe Meldung trotzdem nur einmal am Tag kommt.
          </p>
        </Card>
      </div>

      <Card>
        <CardTitle>Telegram einrichten</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>
            In Vercel unter <em>Settings → Environment Variables</em> die
            Werte <code className="rounded bg-sand px-1">TELEGRAM_BOT_TOKEN</code> und{" "}
            <code className="rounded bg-sand px-1">TELEGRAM_CHAT_ID</code> setzen.
            Beide stehen bereits im Screener-Backend auf Render und können
            unverändert übernommen werden — zwei Absender am selben Bot stören
            sich nicht.
          </li>
          <li>Neu deployen, sonst kennt die Funktion die Werte nicht.</li>
          <li>Oben <strong>Telegram</strong> anhaken und speichern.</li>
          <li>
            <strong>Verbindung prüfen</strong> — sagt, ob Token und Chat-ID
            zusammenpassen, ohne eine Nachricht zu schicken.
          </li>
          <li>
            <strong>Testmeldung senden</strong> — schickt tatsächlich über jeden
            eingeschalteten Kanal.
          </li>
        </ol>
        <p className="mt-3 text-xs text-ink-faint">
          Chat-ID vergessen? Dem Bot in Telegram <code className="rounded bg-sand px-1">/start</code> schicken
          und dann{" "}
          <code className="rounded bg-sand px-1">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>{" "}
          im Browser öffnen: die Zahl steht unter <code className="rounded bg-sand px-1">chat.id</code>.
        </p>
      </Card>

      <Card>
        <CardTitle>Was gerade durchkommt</CardTitle>
        <div className="flex flex-wrap gap-2">
          {(["naehe", "hit", "zeit"] as const).map((art) => {
            const an = werte.arten.includes(art);
            const durchRuhe = an && (!ruhtGerade || (art === "hit" && werte.ruhe_ausser_hit));
            return (
              <Badge key={art} tone={durchRuhe ? "good" : an ? "warn" : "neutral"}
                title={!an ? "ausgeschaltet" : durchRuhe ? "geht raus" : "Ruhezeit hält es zurück"}>
                {ART_LABEL[art]}: {!an ? "aus" : durchRuhe ? "geht raus" : "Ruhezeit"}
              </Badge>
            );
          })}
          <Badge tone={werte.paare.length === 0 ? "good" : "warn"}>
            {werte.paare.length === 0 ? "alle Paare" : `nur ${werte.paare.join(", ")}`}
          </Badge>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Stand {new Intl.DateTimeFormat("de-CH", {
            timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit",
          }).format(new Date())} Uhr Zürich. Die Anzeige rechnet mit derselben
          Funktion, die der Cron-Lauf benutzt — was hier „geht raus" sagt, geht
          auch wirklich raus.
        </p>
      </Card>
    </div>
  );
}
