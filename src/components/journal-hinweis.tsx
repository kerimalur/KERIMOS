import { tradingUserBefund } from "@/lib/trading/journal";
import { Card, CardTitle, Empty } from "@/components/ui";

/**
 * Eine Meldung für den Fall, dass die Trading-Datenbank fehlt oder kein
 * eindeutiger Benutzer feststeht — statt derselbe Text auf acht Seiten.
 *
 * Der Fall „mehrdeutig" ist der wichtige: Die Datenbank antwortet, es gibt nur
 * mehr als ein Konto. Dann wird bewusst **nicht** geraten. Ein falsch
 * geratener Besitzer schriebe Trades, die im Screener niemand mehr sieht —
 * derselbe stille Fehler, den das Backend seit Kurzem ebenfalls verweigert
 * (`SIGNALS_USER_ID` in `supabase_signals.py`).
 */
export async function JournalHinweis({ grund }: { grund: "keine-db" | "kein-user" }) {
  const befund = grund === "keine-db" ? "keine-db" : await tradingUserBefund();

  return (
    <Card>
      <CardTitle>
        {befund === "mehrdeutig"
          ? "Welches Konto ist deins?"
          : "Journal noch nicht verbunden"}
      </CardTitle>

      {befund === "keine-db" && (
        <Empty>
          Die Trading-Datenbank ist nicht eingerichtet. In{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code>{" "}
          und in Vercel fehlen{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">TRADING_SUPABASE_URL</code>{" "}
          und{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">
            TRADING_SUPABASE_SERVICE_ROLE_KEY
          </code>
          .
        </Empty>
      )}

      {befund === "mehrdeutig" && (
        <div className="space-y-3">
          <Empty>
            Im Supabase-Projekt gibt es mehr als ein Konto. KerimOS rät hier
            nicht, welches deins ist — sonst landeten Trades unter einem
            fremden Benutzer und wären im Screener unsichtbar.
          </Empty>
          <p className="text-sm text-ink-muted">
            Deine User-ID steht im Supabase-Dashboard unter{" "}
            <strong className="text-ink-soft">Authentication → Users</strong>.
            Eintragen in{" "}
            <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code>{" "}
            und in Vercel:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-sand px-3 py-2 text-xs text-ink-soft">
TRADING_USER_ID=deine-uuid
          </pre>
          <p className="text-xs text-ink-faint">
            Dieselbe Regel gilt im Screener-Backend als{" "}
            <code className="rounded bg-sand px-1 py-0.5">SIGNALS_USER_ID</code> —
            beide brechen lieber ab, als den falschen Besitzer zu wählen.
          </p>
        </div>
      )}

      {befund === "keiner" && (
        <Empty>
          Die Datenbank antwortet, enthält aber noch kein Konto. Melde dich
          einmal im Screener an — dann gibt es einen Benutzer, dem Trades
          gehören können.
        </Empty>
      )}

      {(befund === "gesetzt" || befund === "eindeutig") && (
        <Empty>
          Der Benutzer steht fest, aber die Abfrage kam trotzdem leer zurück.
          Das deutet auf ein Rechte- oder Netzproblem beim Supabase-Zugriff hin
          — die Server-Logs sagen mehr.
        </Empty>
      )}
    </Card>
  );
}
